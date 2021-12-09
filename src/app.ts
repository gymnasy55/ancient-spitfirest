import { JsonRpcProvider, JsonRpcSigner } from '@ethersproject/providers';
import { ethers, BigNumber, utils } from 'ethers';
import { env } from 'process';
import {
    ERC20__factory,
    UniswapRouterV2__factory
} from '../out/typechain';
import { provider, network, signer, swapHandlers } from '../constants';
import { parseSwapEthInput, SwapEthForTokensInput } from './types/swapEthForTokensInput';
import { ISwapHandler } from './swapHandlers/swapHandlerBase';

let currentHandledTx: string | undefined = undefined;

export default async () => {
    console.log('Started FrontRunning')
    provider.on('pending', handlePendingTransaction);
}

const handlePendingTransaction = async (txHash: string) => {
    if (currentHandledTx) return;

    const tx = await provider.getTransaction(txHash);

    if (!(tx && tx.to && tx.gasPrice && tx.value)) {
        console.error(`Invalid tx`);
        return;
    }

    if (!network.swapRouterAddresses.includes(tx.to)) {
        console.error(`Tx 'to' is not a swapRouter. To: ${tx.to}`);
        return;
    }

    const methodId = getMethodIdFromInputData(tx.data);

    if (!isNeededMethodId(methodId)) {
        console.error(`Unsupported swap method`);
        return;
    }

    currentHandledTx = tx.hash;
    try {
        await executeFrontRunSwap(tx, swapHandlers[methodId], tx.to);
    } catch (err) {
        console.error(err);
    }
    finally {
        currentHandledTx = undefined;
    }
}

const executeFrontRunSwap = async (tx: ethers.providers.TransactionResponse, handler: ISwapHandler, addressTo: string) => {
    if (currentHandledTx && currentHandledTx !== tx.hash) {
        console.info('Already performing front run swap');
        return;
    }

    console.log('!! Front Run Swap !!')

    const swapRouter = UniswapRouterV2__factory.connect(addressTo, signer);

    await handler.handleSwap(tx, swapRouter);

    // console.log('decoded args: ', args);

    // const tokenAddress = args.path[args.path.length];
    // const token = ERC20__factory.connect(tokenAddress, signer);
    // console.log('Buy Token address: ', tokenAddress);

    // const tokenBalanceBeforeSwap = await token.balanceOf(signer.address);
    // const ethBalanceBeforeSwap = await signer.getBalance();

    // const ethToSwap = getAmountToFrontrunSwap(tx.value, ethBalanceBeforeSwap);

    // const receipt = await (await swapRouter.swapExactETHForTokens(0, args.path, signer.address, 0, {
    //     value: ethToSwap,
    //     gasPrice: tx.gasPrice?.add(1),
    //     maxPriorityFeePerGas: (tx.maxPriorityFeePerGas ?? BigNumber.from('1')).add(BigNumber.from('1')),
    //     from: signer.address
    // })).wait();

    // const ethBalanceAfterSwap = await signer.getBalance();
    // const tokenBalanceAfterSwap = await token.balanceOf(signer.address);

    // return {
    //     ethBalanceBefore: ethBalanceBeforeSwap,
    //     ethBalanceAfter: ethBalanceAfterSwap,
    //     tokenBalanceBefore: tokenBalanceBeforeSwap,
    //     tokenBalanceAfter: tokenBalanceAfterSwap,
    //     txReceipt: receipt
    // };
}

const getMethodIdFromInputData = (inputData: string): string => {
    if (!inputData || inputData.length < 10) throw new Error('Input data has no method id');
    return inputData.substr(0, 10);
}

const isNeededMethodId = (methodId: string): boolean => {
    if (!methodId) return false;
    return Boolean(swapHandlers[methodId]);
}