import { ethers, BigNumber, utils, ContractTransaction } from "ethers";
import { network, provider, signer, nonceManager } from '../../../constants';
import { ERC20, ERC20__factory, UniswapRouterV2, UniswapRouterV2__factory } from "../../../out/typechain";
import { calculateSlippage, bigNumberToNumber, subPercentFromValue, logTransaction, cancelTransaction, logToFile, handleError } from "../../helpers";
import { TxHandlerBase } from '../handlerBase';
import { env } from "process";
import state from "../../state";
import { SwapV2Service } from "../../services/swapV2Service";
import { FrUnit } from '../../../out/typechain/FrUnit';
import { FrUnit__factory } from '../../../out/typechain/factories/FrUnit__factory';

type Transaction = {
    tx?: ethers.ContractTransaction,
    txReceipt?: ethers.ContractReceipt,
    nonce?: number
}

const parseSwapEthInput = (val: any): SwapEthForTokensInput => {
    return {
        amountOutMin: val[0],
        path: val[1],
        to: val[2],
        deadline: val[3]
    };
}

type SwapEthForTokensInput = {
    amountOutMin: BigNumber;
    path: string[];
    to: string;
    deadline: BigNumber;
}

export class SwapExactEthForTokensHandler extends TxHandlerBase {
    private frontRunTransaction: Transaction = {}
    private targetTransaction: ethers.ContractTransaction
    private postFrontRunTransaction: Transaction = {}

    private swapRouter: UniswapRouterV2;
    private swapService: SwapV2Service;

    private decodedTx: SwapEthForTokensInput;

    private swapToken: ERC20;

    constructor(tx: ethers.providers.TransactionResponse, addressTo: string, unitAddress: string) {
        super();
        this.swapRouter = UniswapRouterV2__factory.connect(addressTo, signer);
        this.swapService = new SwapV2Service(FrUnit__factory.connect(unitAddress, signer), this.swapRouter);

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

        const tokenInfo = network.allowedFrontRunTokens[this.swapToken.address];

        if (!tokenInfo)
            throw new Error('Token is not in the list');

        const tokenDecimals = tokenInfo.decimals;

        const amountsOut = await this.swapService.getAmountsOut(
            tx.value,
            this.decodedTx.path
        );

        const amountOutFormatted = bigNumberToNumber(amountsOut[amountsOut.length - 1], tokenDecimals);
        const amountOutMinFormatted = bigNumberToNumber(this.decodedTx.amountOutMin, tokenDecimals);

        console.log(
            '\namount in', bigNumberToNumber(tx.value),
            '\namount out: ', amountOutFormatted,
            '\namount out min:', amountOutMinFormatted);

        const slippage = calculateSlippage(
            amountOutFormatted,
            amountOutMinFormatted);

        console.log('slippage: ', slippage, '%');

        if (slippage < env.MIN_SLIPPAGE_PERCENTAGE) {
            console.log('slippage is lower than minimal needed');
            return;
        }
        const balanceBefore = await provider.getBalance(this.swapService.unit.address);
        console.log('BALANCE BEFORE: ', utils.formatEther(balanceBefore));

        console.time('START calculateMaxETHToSend')
        const maxEthToSend = await this.swapService.calculateMaxETHToSend(this.decodedTx.amountOutMin, amountsOut, this.decodedTx.path);
        console.timeEnd('START calculateMaxETHToSend')

        let ethToSend = maxEthToSend.mul(95).div(100);
        ethToSend = ethToSend.gt(balanceBefore) ? balanceBefore : ethToSend;

        console.log('maxEthToSend', ethers.utils.formatEther(maxEthToSend));
        console.log('Eth to send', ethers.utils.formatEther(ethToSend));

        // if (balanceBefore.lt(ethToSend)) {
        //     console.error('INSUFFICIENT BALANCE!');
        //     return;
        // }

        this.frontRunTransaction.nonce = await nonceManager.getNonce();

        const { txPromise: frontrunTxPromise } = await this.performFrontrunSwap(
            this.frontRunTransaction.nonce,
            tokenDecimals,
            env.MAX_FRONTRUN_SLIPPAGE_PERCENTAGE,
            ethToSend);

        try {
            this.frontRunTransaction.tx = (await frontrunTxPromise);
            logTransaction(this.frontRunTransaction.tx, 'Frontrun swap');
        } catch (err) {
            this.handleTxError(err);
            return;
        }

        this.frontRunTransaction.tx.wait().then(txReceipt => {
            logTransaction(txReceipt, 'Frontrun swap completed!');
            this.frontRunTransaction.txReceipt = txReceipt;
        }).catch(
            (err) => {
                // TODO somehow check that tx is mined or not
                this.handleTxError(err);
            }
        );;

        tx.wait().then(txReceipt => {
            logTransaction(txReceipt, 'Frontrun-ed tx is completed!');
            if (!this.frontRunTransaction.txReceipt || !this.frontRunTransaction.tx) {
                throw new Error('Frontrun-ed is completed but pre-frontrun transaction is not yet mined/sended');
            }

        }).catch(
            (err) => {
                this.handleTxError(err);
            }
        );

        this.postFrontRunTransaction.nonce = await nonceManager.getNonce();

        const { txPromise: postFrontrunTxPromise } = await this.performPostSwap(
            this.postFrontRunTransaction.nonce,
            env.MAX_FRONTRUN_SLIPPAGE_PERCENTAGE,
        );

        try {
            this.postFrontRunTransaction.tx = await postFrontrunTxPromise;
            logTransaction(this.postFrontRunTransaction.tx, 'Post_Frontrun swap');
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
    private async cancelTxIfNotMinedYet(tx: Transaction) {
        console.log("Cancel");

        if (!tx.tx) {
            console.log('Cancel: Targeted transaction is not event exists');
            return;
        }

        if (!tx.nonce) {
            console.log('Cancel: Cannot cancel, nonce is note set');
            return;
        }

        if (tx.txReceipt) {
            console.log('Cancel: Cannot cancel, because tx is already mined');
            return;
        }

        (await cancelTransaction(tx.nonce, tx.tx)).wait().then(v => {
            console.log('Cancel: Tx is canceled');
        });
    }

    private async handleTxError(error: any) {
        console.error('ERROR OCCURRED. Trying to cancel transactions', error);

        const p1 = this.cancelTxIfNotMinedYet(this.frontRunTransaction);
        this.frontRunTransaction = {};

        const p2 = this.cancelTxIfNotMinedYet(this.postFrontRunTransaction);
        this.postFrontRunTransaction = {};

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
        const ethBalanceAfter = await provider.getBalance(this.swapService.unit.address);

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

        const gasPrice = this.targetTransaction.gasPrice?.add(utils.parseUnits('10', 'gwei')) ?? 0;
        const path = this.decodedTx.path;
        const deadline = this.decodedTx.deadline;

        const amountOut = (await this.swapService.getAmountsOut(
            ethValue,
            path,
        ))[path.length - 1];

        const amountOutMin = subPercentFromValue({ value: amountOut, decimals: tokenDecimals }, maxSlippage);

        console.log(utils.formatUnits(amountOutMin, tokenDecimals));

        const promise = this.swapService.swapExactETHForTokens(
            ethValue,
            path,
            amountOutMin,
            deadline,
            {
                nonce: nonce,
                gasPrice: gasPrice,
                gasLimit: 500_000
            }
        )

        return {
            txPromise: promise,
            minTokensGet: amountOutMin
        };
    }

    private async performPostSwap(
        nonce: number,
        slippage: number,
    ): Promise<{
        txPromise: Promise<ContractTransaction>
    }> {
        console.log('!POST SWAP!');

        const gasPrice = this.targetTransaction.gasPrice?.sub(1) ?? 0;

        const path = Array.from(this.decodedTx.path).reverse();
        const deadline = this.decodedTx.deadline;

        const txPromise = this.swapService.swapExactTokensForETH(
            slippage,
            path,
            deadline,
            {
                nonce: nonce,
                gasPrice: gasPrice,
                gasLimit: 500_000
            }
        )

        return {
            txPromise,
        };
    }

    private decodeTransactionArguments(tx: ethers.providers.TransactionResponse): SwapEthForTokensInput {
        return parseSwapEthInput(UniswapRouterV2__factory.createInterface().decodeFunctionData(this.getFunctionName(), tx.data));
    }
}
