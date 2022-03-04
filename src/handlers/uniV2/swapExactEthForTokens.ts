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
    isCanceled: boolean,
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
    private frontRunTransaction: Transaction = { isCanceled: false }
    private targetTransaction: ethers.ContractTransaction
    private postFrontRunTransaction: Transaction = { isCanceled: false }

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

        const slippage = calculateSlippage(
            amountOutFormatted,
            amountOutMinFormatted);


        if (slippage < env.MIN_SLIPPAGE_PERCENTAGE) {
            console.log('slippage is lower than minimal needed');
            return;
        }


        const balanceBefore = await provider.getBalance(this.swapService.unit.address);

        const tLable = 'max eth to send calc time';
        console.time(tLable)
        const maxEthToSend = await this.swapService.calculateMaxETHToSend(this.decodedTx.amountOutMin, amountsOut, this.decodedTx.path);
        console.timeEnd(tLable)

        let ethToSend = maxEthToSend.mul(env.MAX_ETH_TO_SEND_PERCENTAGE).div(100);
        ethToSend = ethToSend.gt(balanceBefore) ? balanceBefore : ethToSend;

        console.table({
            token: this.swapToken.address,
            amountIn: bigNumberToNumber(tx.value),
            amountOutMin: amountOutMinFormatted,
            slippage: slippage.toString() + '%',
            maxEthToSend: parseFloat(ethers.utils.formatEther(maxEthToSend)),
            ethWillBeSend: parseFloat(ethers.utils.formatEther(ethToSend))
        });

        this.frontRunTransaction.nonce = await nonceManager.getNonce();

        const { txPromise: frontrunTxPromise } = await this.performFrontrunSwap(
            this.frontRunTransaction.nonce,
            tokenDecimals,
            env.MAX_FRONTRUN_SLIPPAGE_PERCENTAGE,
            ethToSend);

        try {
            this.frontRunTransaction.tx = (await frontrunTxPromise);
            logTransaction(this.frontRunTransaction.tx, 'Frontrun swap sended to mempool'.blue);
        } catch (err) {
            this.handleTxError(err);
            return;
        }

        this.frontRunTransaction.tx.wait().then(txReceipt => {
            logTransaction(txReceipt, 'Frontrun tx completed!'.green);
            this.frontRunTransaction.txReceipt = txReceipt;
        }).catch(
            (err) => {
                // TODO somehow check that tx is mined or not
                this.handleTxError(err);
            }
        );;

        tx.wait().then(txReceipt => {
            logTransaction(txReceipt, 'Frontrun-ed tx is completed!'.green);
            if (!this.frontRunTransaction.txReceipt || !this.frontRunTransaction.tx) {
                throw new Error('Frontrun-ed is completed but pre/post-frontrun transactions is not yet mined/sended');
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
            logTransaction(this.postFrontRunTransaction.tx, 'Post Frontrun swap sended to mempool'.blue);
        } catch (err) {
            this.handleTxError(err);
            return;
        }

        this.postFrontRunTransaction.tx.wait()
            .then(txReceipt => {
                logTransaction(txReceipt, 'Post Frontrun tx is completed!'.green);
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
        if (!tx.tx) {
            console.log('Cancel: Targeted transaction is not event exists'.red);
            return;
        }

        if (!tx.nonce) {
            console.log('Cancel: Cannot cancel, nonce is note set'.red);
            return;
        }

        if (tx.txReceipt) {
            console.log('Cancel: Cannot cancel, because tx is already mined'.red);
            return;
        }

        (await cancelTransaction(tx.nonce, tx.tx)).wait().then(v => {
            console.log('Cancel: Tx is canceled'.red);
        });
    }

    private async handleTxError(error: any) {
        console.error('Tx error. Trying to cancel transactions'.red);

        let p1, p2: Promise<void>;

        if (!this.frontRunTransaction.isCanceled) {
            p1 = this.cancelTxIfNotMinedYet(this.frontRunTransaction);
            this.frontRunTransaction = { isCanceled: true };
        } else {
            p1 = Promise.resolve();
        }

        if (!this.postFrontRunTransaction.isCanceled) {
            p2 = this.cancelTxIfNotMinedYet(this.postFrontRunTransaction);
            this.postFrontRunTransaction = { isCanceled: true }
        } else {
            p2 = Promise.resolve();
        }

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

        const gasPrice = this.targetTransaction.gasPrice?.add(utils.parseUnits('20', 'gwei')) ?? 0;
        const path = this.decodedTx.path;
        const deadline = this.decodedTx.deadline;

        const amountOut = (await this.swapService.getAmountsOut(
            ethValue,
            path,
        ))[path.length - 1];

        const amountOutMin = subPercentFromValue({ value: amountOut, decimals: tokenDecimals }, maxSlippage);

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
        const gasPrice = this.targetTransaction.gasPrice;

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
