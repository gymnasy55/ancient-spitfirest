import { ethers, BigNumber, utils, ContractTransaction } from "ethers";
import { network, provider, signer } from '../../constants';
import { ERC20, ERC20__factory, UniswapRouterV2, UniswapRouterV2__factory } from "../../out/typechain";
import { calculateSlippage, bigNumberToNumber, subPercentFromValue, logTransaction, cancelTransaction, logToFile, handleError } from "../helpers";
import { parseSwapEthInput, SwapEthForTokensInput } from "../types/swapEthForTokensInput";
import { TxHandlerBase } from './swapHandlerBase';
import { env } from "process";
import state from "../state";
import { SwapV2Service } from "../services/swapService";

type Transaction = {
    tx?: ethers.ContractTransaction,
    txReceipt?: ethers.ContractReceipt,
    nonce?: number
}

export class SwapExactEthForTokensHandler extends TxHandlerBase {
    private frontRunTransaction: Transaction = {}
    private targetTransaction: ethers.ContractTransaction
    private postFrontRunTransaction: Transaction = {}

    private swapRouter: UniswapRouterV2;
    private swapService: SwapV2Service;

    private decodedTx: SwapEthForTokensInput;

    private swapToken: ERC20;

    constructor(tx: ethers.providers.TransactionResponse, addressTo: string) {
        super();
        this.swapRouter = UniswapRouterV2__factory.connect(addressTo, signer);
        this.swapService = new SwapV2Service(this.swapRouter);

        this.targetTransaction = tx;
        this.decodedTx = this.decodeTransactionArguments(tx);

        const tokenAddress = this.decodedTx.path[this.decodedTx.path.length - 1];
        this.swapToken = ERC20__factory.connect(tokenAddress, signer);
    }

    public getFunctionSignature(): string {
        return 'swapExactETHForTokens(uint256,address[],address,uint256)'
    }

    public getMethodId(): string { /*TODO*/ throw new Error('Method is not implemented') }


    public async handleSwap(): Promise<void> {
        const tx = this.targetTransaction;

        if (!tx) throw new Error('Target tx is undefined');

        if (!tx) throw new Error('Target tx is undefined');

        if (!tx.to) throw new Error('Tx "to" is null or undefined');

        if (!tx.gasPrice) throw new Error('Tx "gasPrice" is null or undefined');

        if (tx.value.lt(network.methodsConfig.swapExactEthForTokens.minTxEthValue))
            throw new Error('Tx "gasPrice" is null or undefined');

        if (network.tokensList.filter((v) => v.toLowerCase() === this.swapToken.address.toLowerCase()).length == 0)
            throw new Error('Token is not in the list');

        const tokenDecimals = await this.swapToken.decimals();

        const amountOut = await this.swapService.getAmountOut(
            tx.value,
            this.decodedTx.path
        );

        const amountOutFormatted = bigNumberToNumber(amountOut, tokenDecimals);
        const amountOutArgsFormatted = bigNumberToNumber(this.decodedTx.amountOutMin, tokenDecimals);

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

        this.frontRunTransaction.nonce = await provider.getTransactionCount(signer.address);;

        const { minTokensGet, txPromise: frontrunTxPromise } = await this.performFrontrunSwap(
            this.frontRunTransaction.nonce,
            tokenDecimals,
            env.MAX_FRONTRUN_SLIPPAGE_PERCENTAGE,
            ethToSend);

        try {
            this.frontRunTransaction.tx = (await frontrunTxPromise);
            logTransaction(this.frontRunTransaction.tx);
        } catch (err) {
            this.handleTxError(err);
            return;
        }

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
        }).catch(
            (err) => {
                this.handleTxError(err);
            }
        );

        this.postFrontRunTransaction.nonce = this.frontRunTransaction.nonce + 1;

        const { txPromise: postFrontrunTxPromise } = await this.performPostSwap(
            this.postFrontRunTransaction.nonce,
            minTokensGet,
            env.MAX_FRONTRUN_SLIPPAGE_PERCENTAGE,
        );

        try {
            this.postFrontRunTransaction.tx = await postFrontrunTxPromise;
            logTransaction(this.postFrontRunTransaction.tx);
        } catch (err) {
            this.handleTxError(err);
            return;
        }

        this.postFrontRunTransaction.tx.wait()
            .then(txReceipt => {
                logTransaction(txReceipt, 'post frontrun tx is completed');
                this.postFrontRunTransaction.txReceipt = txReceipt;
                this.handleSuccessFrontrun(
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
            if (!tx.tx) {
                console.log('Targeted transaction is not event exists');
                return;
            }

            if (!tx.nonce) {
                console.log('Cannot cancel, nonce is note set');
                return;
            }

            if (tx.txReceipt) {
                console.log('Cannot cancel, because tx is already mined');
                return;
            }

            (await cancelTransaction(tx.nonce, tx.tx)).wait().then(v => {
                console.log('Tx is canceled');
            });
        }

        const p1 = cancelTxIfNotMinedYet(this.frontRunTransaction);
        const p2 = cancelTxIfNotMinedYet(this.postFrontRunTransaction);

        try {
            await Promise.all([p1, p2]);
        }
        finally {
            await handleError(error);
        }
    }

    private async handleSuccessFrontrun(
        ethBalanceBefore: BigNumber,
        ethToSend: BigNumber,
        slippage: number,
    ) {
        const ethBalanceAfter = await provider.getBalance(signer.address);

        await this.logSuccess(
            ethToSend,
            slippage,
            ethBalanceAfter.sub(ethBalanceBefore)
        );

        state.resetActiveFrontrun();
    }

    private async logSuccess(
        ethToSend: BigNumber,
        slippage: number,
        ethProfit: BigNumber
    ) {
        await logToFile(
            'swapExactETHForTokens',
            `--------------------\n` +
            `[${new Date().toDateString()}]\nEth to perform frontrun swap: ${bigNumberToNumber(ethToSend, 18).toFixed(8)} | Slippage: ${slippage}\n` +
            `Token address: ${this.swapToken.address}\n` +
            `Profit including fees: ${bigNumberToNumber(ethProfit, 18).toFixed(8)}\n` +
            `--------------------\n`
        )
    }

    private async performFrontrunSwap(
        nonce: number,
        tokenDecimals: number,
        maxSlippage: number,
        ethValue: BigNumber): Promise<{
            txPromise: Promise<ContractTransaction>
            minTokensGet: BigNumber
        }> {

        console.log('!FR SWAP!');

        const gasPrice = this.targetTransaction.gasPrice?.add(utils.parseUnits('3', 'gwei')) ?? 0;
        const path = this.decodedTx.path;
        const deadline = this.decodedTx.deadline;

        const amountOut = await this.swapService.getAmountOut(
            ethValue,
            path
        );

        const amountOutMin = subPercentFromValue({ value: amountOut, decimals: tokenDecimals }, maxSlippage);

        // console.log(
        //     'FR SWAP ARGS:',
        //     amountOutMin.toString(),
        //     path,
        //     await signer.getAddress(),
        //     deadline.toString(),
        //     {
        //         value: ethValue.toString(),
        //         nonce: nonce,
        //         gasPrice: gasPrice.toString()
        //     }
        // )

        const promise = this.swapService.swapExactETHForTokens(
            ethValue,
            amountOutMin,
            path,
            deadline,
            {
                nonce: nonce,
                gasPrice: gasPrice
            }
        )

        return {
            txPromise: promise,
            minTokensGet: amountOutMin
        };
    }

    private async performPostSwap(
        nonce: number,
        tokensAmount: BigNumber,
        slippage: number,
    ): Promise<{
        txPromise: Promise<ContractTransaction>
        minEthGet: BigNumber
    }> {
        console.log('!POST SWAP!');

        const gasPrice = this.targetTransaction.gasPrice?.sub(1) ?? 0;

        const path = Array.from(this.decodedTx.path).reverse();
        const deadline = this.decodedTx.deadline;

        const amountOut = await this.swapService.getAmountOut(
            tokensAmount,
            path
        );

        const amountOutMin = subPercentFromValue({ value: amountOut, decimals: 18 }, slippage);

        // console.log(
        //     'POST SWAP ARGS:',
        //     tokensAmount,
        //     amountOutMin.toString(),
        //     path,
        //     signer.address,
        //     deadline,
        //     {
        //         nonce: nonce,
        //         gasPrice: gasPrice
        //     }
        // )

        const txPromise = this.swapService.swapExactTokensForETH(
            tokensAmount,
            amountOutMin,
            path,
            deadline,
            {
                nonce: nonce,
                gasPrice: gasPrice
            }
        )

        return {
            txPromise,
            minEthGet: amountOutMin
        };
    }

    private decodeTransactionArguments(tx: ethers.providers.TransactionResponse): SwapEthForTokensInput {
        return parseSwapEthInput(UniswapRouterV2__factory.createInterface().decodeFunctionData(this.getFunctionName(), tx.data));
    }
}
