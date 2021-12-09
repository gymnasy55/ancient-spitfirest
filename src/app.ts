import { ethers } from 'ethers';
import {
    UniswapRouterV2__factory
} from '../out/typechain';
import { provider, network, signer, swapHandlers } from '../constants';
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
}

const getMethodIdFromInputData = (inputData: string): string => {
    if (!inputData || inputData.length < 10) throw new Error('Input data has no method id');
    return inputData.substr(0, 10);
}

const isNeededMethodId = (methodId: string): boolean => {
    if (!methodId) return false;
    return Boolean(swapHandlers[methodId]);
}