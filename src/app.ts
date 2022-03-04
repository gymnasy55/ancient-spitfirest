import { BigNumber, utils, providers } from 'ethers';
import { provider, network, signer } from '../constants';
import { ITxHandler } from './handlers/handlerBase';
import { equalWithEpsilon, handleError } from './helpers';
import 'colorts/lib/string';

export default async () => {
    console.log('Watching mempool...'.green)
    provider.on('pending', handlePendingTransaction);
}

const handlePendingTransaction = async (txHash: string) => {
    // if (state.hasActiveFrontrun()) {
    //     if (state.frontrunningTransaction?.hash?.toLowerCase() === txHash.toLowerCase()) {
    //         console.log('FRONTRUNNING TRANSACTION IS CHANGED');
    //         // todo handle somehow
    //     }
    //     return;
    // }


    const tx = await provider.getTransaction(txHash);

    if (!(tx && tx.to && tx.gasPrice && tx.value)) {
        // console.error(`Invalid tx`);
        return;
    }

    if (tx.from.toLowerCase() === signer.address) {
        // console.error(`Self tx found. Skipping`.yellow);
        return;
    }

    if (!network.swapRouterAddresses.includes(tx.to)) {
        // console.error(`Tx 'to' is not a swapRouter. To: ${tx.to}`.yellow);
        return;
    }

    const baseGasPrice = await provider.getGasPrice()
    const fmtGwei = (gasPrice: BigNumber) => utils.formatUnits(gasPrice, "gwei")

    // todo fix!
    if (!equalWithEpsilon(tx.gasPrice, baseGasPrice, utils.parseUnits('0.5', 'gwei'))) {
        // console.error(`Gas price is lower/higher than the avg. ${fmtGwei(tx.gasPrice)} ${tx.gasPrice.gt(baseGasPrice) ? '>' : '<'} ${fmtGwei(baseGasPrice)}`);
        return;
    }

    const methodId = getMethodIdFromInputData(tx.data);

    if (!isHandlerExists(tx.to, methodId)) {
        // console.error(`Unsupported swap method`.yellow);
        return;
    }

    try {
        await executeFrontRunSwap(tx, await network.handlers[tx.to].factories[methodId](tx, tx.to));
    } catch (err) {
        await handleError(err);
    }
}

const executeFrontRunSwap = async (tx: providers.TransactionResponse, handler: ITxHandler) => {
    // if (state.hasActiveFrontrun()) {
    //     console.info('Already performing front run swap');
    //     return;
    // }

    // state.frontrunningTransaction = tx;

    console.log('Handle swap'.cyan)

    await handler.handleSwap();
}

const getMethodIdFromInputData = (inputData: string): string => {
    if (!inputData || inputData.length < 10) throw new Error('Input data has no method id');
    return inputData.substr(0, 10);
}

const isHandlerExists = (to: string, methodId: string): boolean => {
    if (!methodId) return false;
    return Boolean(network.handlers[to] && network.handlers[to].factories[methodId]);
}