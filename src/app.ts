import { BigNumber, ethers, providers, utils } from 'ethers';
import {
    ERC20__factory,
    UniswapRouterV2__factory
} from '../out/typechain';
import { provider, network, signer } from '../constants';
import { ITxHandler } from './handlers/handlerBase';
import { equalWithEpsilon, handleError } from './helpers';
import state from "./state";

export default async () => {
    await approveAll();
    console.log('Started FrontRunning')
    provider.on('pending', handlePendingTransaction);
}

const approveAll = async () => {
    console.log('Start approving all!')

    const gasPrice = await provider.getGasPrice();

    for (let tokenAddress of network.allowedFrontRunTokens) {
        console.log('token addr', tokenAddress);

        const token = ERC20__factory.connect(tokenAddress, signer);

        for (let routerAddress of network.swapRouterAddresses) {
            console.log('router addr', routerAddress);

            console.log(await token.allowance(signer.address, routerAddress));
            if (!(await token.allowance(signer.address, routerAddress)).eq(ethers.constants.MaxUint256)) {
                await token.approve(routerAddress, ethers.constants.MaxUint256, { gasPrice: gasPrice });
            }
        }
    }

    console.log('APPROVED!');
}

const handlePendingTransaction = async (txHash: string) => {
    if (state.hasActiveFrontrun()) {
        if (state.frontrunningTransaction?.hash?.toLowerCase() === txHash.toLowerCase()) {
            console.log('FRONTRUNNING TRANSACTION IS CHANGED');
            // todo handle somehow
        }
        return;
    }


    const tx = await provider.getTransaction(txHash);

    if (!(tx && tx.to && tx.gasPrice && tx.value)) {
        //  console.error(`Invalid tx`);
        return;
    }

    if (tx.from.toLowerCase() === signer.address) {
        console.error(`Self tx found. Skipping`);
        return;
    }

    if (!network.swapRouterAddresses.includes(tx.to)) {
        //console.error(`Tx 'to' is not a swapRouter. To: ${tx.to}`);
        return;
    }

    const baseGasPrice = await provider.getGasPrice()
    const fmtGwei = (gasPrice: BigNumber) => ethers.utils.formatUnits(gasPrice, "gwei")

    // todo fix!
    if (!equalWithEpsilon(tx.gasPrice, baseGasPrice, utils.parseUnits('0.5', 'gwei'))) {
        console.error(`Gas price is lower/higher than the avg. ${fmtGwei(tx.gasPrice)} ${tx.gasPrice.gt(baseGasPrice) ? '>' : '<'} ${fmtGwei(baseGasPrice)}`);
        return;
    }

    const methodId = getMethodIdFromInputData(tx.data);

    if (!isHandlerExists(tx.to, methodId)) {
        console.error(`Unsupported swap method`);
        return;
    }

    try {
        await executeFrontRunSwap(tx, await network.handlers[tx.to].factories[methodId](tx, tx.to));
    } catch (err) {
        await handleError(err);
    }
}

const executeFrontRunSwap = async (tx: ethers.providers.TransactionResponse, handler: ITxHandler) => {
    if (state.hasActiveFrontrun()) {
        console.info('Already performing front run swap');
        return;
    }

    state.frontrunningTransaction = tx;

    console.log('!! Front Run Swap !!')

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