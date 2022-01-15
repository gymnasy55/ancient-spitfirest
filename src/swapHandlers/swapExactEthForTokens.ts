import { ethers, BigNumber, utils, ContractTransaction } from "ethers";
import { network, provider, signer } from '../../constants';
import { ERC20, ERC20__factory, UniswapRouterV2, UniswapRouterV2__factory } from "../../out/typechain";
import { calculateSlippage, bigNumberToNumber, subPercentFromValue, logTransaction, cancelTransaction } from "../helpers";
import { parseSwapEthInput, SwapEthForTokensInput } from "../types/swapEthForTokensInput";
import { SwapHandlerBase } from './swapHandlerBase';
import fs, { unwatchFile } from 'fs';
import { env } from "process";
import state from "../state";

type Transaction = {
    tx?: ethers.ContractTransaction,
    txReceipt?: ethers.ContractReceipt,
}

export class SwapExactEthForTokensHandler extends SwapHandlerBase {
    private frontRunTransaction: Transaction = {}
    private targetTransaction: Transaction = {}
    private postFrontRunTransaction: Transaction = {}

    public getFunctionSignature(): string {
        return 'swapExactETHForTokens(uint256,address[],address,uint256)'
    }

    public getMethodId(): string { return ''; }

    public async handleSwap(tx: ethers.providers.TransactionResponse, router: UniswapRouterV2): Promise<void> {
        this.frontRunTransaction.tx = tx;

        if (!tx.to) throw new Error('Tx "to" is null or undefined');

        if (!tx.gasPrice) throw new Error('Tx "gasPrice" is null or undefined');

        if (tx.value.lt(network.methodsConfig.swapExactEthForTokens.minTxEthValue)) {
            console.error('Tx value is lower than minimum required');
            return;
        }

        const decodedTx = this.decodeTransactionArguments(tx);

        console.log('Decoded TX: ', JSON.stringify(decodedTx));

        if (network.tokensList.filter((v) => v.toLowerCase() === decodedTx.path[decodedTx.path.length - 1].toLowerCase()).length == 0) {
            console.log('Token is not in the list')
            return;
        }

        const tokenAddress = decodedTx.path[decodedTx.path.length - 1];
        const token = ERC20__factory.connect(tokenAddress, signer);
        const tokenDecimals = await token.decimals();
        console.log('Token decimals: ', tokenDecimals);

        const amountOut = await router.getAmountsOut(
            tx.value,
            decodedTx.path
        );

        const amountOutFormatted = bigNumberToNumber(amountOut[amountOut.length - 1], tokenDecimals);
        const amountOutArgsFormatted = bigNumberToNumber(decodedTx.amountOutMin, tokenDecimals);

        console.log(
            '\namount out: ', amountOutFormatted,
            '\namount out min:', amountOutArgsFormatted);

        const slippage = calculateSlippage(
            amountOutFormatted,
            amountOutArgsFormatted);

        console.log('slippage: ', slippage, '%');

        if (slippage < env.MIN_SLIPPAGE_PERCENTAGE) {
            console.log('slippage is lower than minimal needed');
            return;
        }
        const balanceBefore = await provider.getBalance(signer.address);

        const ethToSend = network.methodsConfig.swapExactEthForTokens.maxFREthValue;

        if (balanceBefore.lt(ethToSend)) {
            console.error('INSUFFICIENT BALANCE!');
            return;
        }

        const frontrunSwapNonce = await provider.getTransactionCount(signer.address);

        const { minTokensGet, txPromise: frontrunTxPromise } = await this.performFrontrunSwap(
            router,
            frontrunSwapNonce,
            tx.gasPrice.add(utils.parseUnits('3', 'gwei')),
            tokenDecimals,
            decodedTx.path,
            decodedTx.deadline,
            env.MAX_FRONTRUN_SLIPPAGE_PERCENTAGE,
            ethToSend);

        this.frontRunTransaction.tx = (await frontrunTxPromise);

        logTransaction(this.frontRunTransaction.tx);

        this.frontRunTransaction.tx.wait().then(txReceipt => {
            logTransaction(txReceipt, 'Frontrun swap completed!');
            this.frontRunTransaction.txReceipt = txReceipt;
        }).catch(
            (err) => {
                this.handleTxError(err);
            }
        );;

        tx.wait().then(txReceipt => {
            logTransaction(txReceipt, 'Frontrun-ed tx is completed!');
            this.targetTransaction.txReceipt = txReceipt;
        }).catch(
            (err) => {
                this.handleTxError(err);
            }
        );

        const postFrontrunSwapNonce = frontrunSwapNonce + 1;

        const { minEthGet, txPromise: postFrontrunTxPromise } = await this.performPostSwap(
            router,
            postFrontrunSwapNonce,
            tx.gasPrice.sub(1),
            minTokensGet,
            // reserve() mutates original array!
            Array.from(decodedTx.path).reverse(),
            decodedTx.deadline,
            env.MAX_FRONTRUN_SLIPPAGE_PERCENTAGE,
        );

        this.postFrontRunTransaction.tx = await postFrontrunTxPromise;

        logTransaction(this.postFrontRunTransaction.tx);

        this.postFrontRunTransaction.tx.wait()
            .then(txReceipt => {
                logTransaction(txReceipt, 'post frontrun tx is completed');
                this.postFrontRunTransaction.txReceipt = txReceipt;
                this.handleSuccessFrontrun(
                    tokenAddress,
                    balanceBefore,
                    ethToSend,
                    slippage,
                );
            }).catch(
                (err) => {
                    this.handleTxError(err);
                }
            );
    }

    private async handleTxError(error: any) {
        const cancelTxIfNotMinedYet = async (tx: Transaction) => {
            if (tx.tx) {
                if (!tx.txReceipt) {
                    (await cancelTransaction(tx.tx)).wait().then(v => {
                        console.log('Tx canceled');
                    });
                } else {
                    console.log('Cannot cancel, because tx is already mined');
                }
            } else {
                console.log('Targeted transaction is not event exists');
            }
        }

        cancelTxIfNotMinedYet(this.frontRunTransaction);
        cancelTxIfNotMinedYet(this.postFrontRunTransaction);
        state.resetActiveFrontrun();
    }

    private async handleSuccessFrontrun(
        tokenAddress: string,
        ethBalanceBefore: BigNumber,
        ethToSend: BigNumber,
        slippage: number,
    ) {
        const ethBalanceAfter = await provider.getBalance(signer.address);

        await this.logSuccess(
            tokenAddress,
            ethToSend,
            slippage,
            ethBalanceAfter.sub(ethBalanceBefore)
        );
    }

    private async logSuccess(
        token: string,
        ethToSend: BigNumber,
        slippage: number,
        ethGet: BigNumber
    ) {
        await logToFile(
            `--------------------\n` +
            `[${new Date().toDateString()}]\nEth to perform frontrun swap: ${bigNumberToNumber(ethToSend, 18).toFixed(8)} | Slippage: ${slippage}\n` +
            `Token address: ${token}\n` +
            `Eth received after post frontrun swap: ${bigNumberToNumber(ethGet, 18).toFixed(8)} | Profit: ${bigNumberToNumber(ethGet.sub(ethToSend), 18).toFixed(8)}\n` +
            `--------------------\n`
        )
    }

    private async performFrontrunSwap(
        router: UniswapRouterV2,
        nonce: number,
        gasPrice: BigNumber,
        tokenDecimals: number,
        path: string[],
        deadline: BigNumber,
        maxSlippage: number,
        ethValue: BigNumber): Promise<{
            txPromise: Promise<ContractTransaction>
            minTokensGet: BigNumber
        }> {

        console.log('!FR SWAP!');

        const amountOut = await router.getAmountsOut(
            ethValue,
            path
        );

        const tokensGet = amountOut[amountOut.length - 1];

        const minTokensGet = subPercentFromValue({ value: tokensGet, decimals: tokenDecimals }, maxSlippage);

        console.log(
            'FR SWAP ARGS:',
            minTokensGet.toString(),
            path,
            await signer.getAddress(),
            deadline.toString(),
            {
                value: ethValue.toString(),
                nonce: nonce,
                gasPrice: gasPrice.toString()
            }
        )

        const promise = router.swapExactETHForTokens(
            minTokensGet,
            path,
            await signer.getAddress(),
            deadline,
            {
                value: ethValue,
                nonce: nonce,
                gasPrice: gasPrice
            }
        )

        return {
            txPromise: promise,
            minTokensGet: minTokensGet
        };
    }

    private async performPostSwap(
        router: UniswapRouterV2,
        nonce: number,
        gasPrice: BigNumber,
        tokensAmount: BigNumber,
        path: string[],
        deadline: BigNumber,
        maxSlippage: number,
    ): Promise<{
        txPromise: Promise<ContractTransaction>
        minEthGet: BigNumber
    }> {
        console.log('!POST SWAP!');

        const amountOut = await router.getAmountsOut(
            tokensAmount,
            path
        );

        const ethGet = amountOut[amountOut.length - 1];

        const minEthGet = subPercentFromValue({ value: ethGet, decimals: 18 }, maxSlippage);

        console.log(
            'POST SWAP ARGS:',
            tokensAmount,
            minEthGet.toString(),
            path,
            signer.address,
            deadline,
            {
                nonce: nonce,
                gasPrice: gasPrice
            }
        )

        const token = ERC20__factory.connect(path[0], signer);
        console.log('allowance:', await token.allowance(signer.address, router.address));

        const txPromise = router.swapExactTokensForETH(
            tokensAmount,
            minEthGet,
            path,
            signer.address,
            deadline,
            {
                nonce: nonce,
                gasPrice: gasPrice
            }
        )

        return {
            txPromise,
            minEthGet: minEthGet
        };
    }

    private decodeTransactionArguments(tx: ethers.providers.TransactionResponse): SwapEthForTokensInput {
        return parseSwapEthInput(UniswapRouterV2__factory.createInterface().decodeFunctionData(this.getFunctionName(), tx.data));
    }
}

const logToFile = async (message: string) => {
    const filePath = './logs/';

    if (!fs.existsSync(filePath))
        fs.mkdirSync(filePath);

    var stream = fs.createWriteStream(filePath + "swapExactEthForTokens.log", { flags: 'a+' });
    stream.write(message);
    stream.end();
}