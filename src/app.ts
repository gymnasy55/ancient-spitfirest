import { BigNumber, ethers, providers, utils } from 'ethers';
import {
    ERC20__factory,
    UniswapRouterV2__factory
} from '../out/typechain';
import { provider, network, signer, swapHandlers } from '../constants';
import { ISwapHandler } from './swapHandlers/swapHandlerBase';
import { equalWithEpsilon } from './helpers';
import state from "./state";

export default async () => {
    await approveAll();
    console.log('Started FrontRunning')
    provider.on('pending', handlePendingTransaction);
}

const approveAll = async () => {
    console.log('Start approving all!')

    const gasPrice = await provider.getGasPrice();

    for (let tokenAddress of network.tokensList) {
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

    if (!network.swapRouterAddresses.includes(tx.to)) {
        //console.error(`Tx 'to' is not a swapRouter. To: ${tx.to}`);
        return;
    }

    const baseGasPrice = await provider.getGasPrice()
    const fmtGwei = (gasPrice: BigNumber) => ethers.utils.formatUnits(gasPrice, "gwei")

    if (!equalWithEpsilon(tx.gasPrice, baseGasPrice, utils.parseUnits('0.5', 'gwei'))) {
        console.error(`Gas price is lower than needed. ${fmtGwei(tx.gasPrice)} < ${fmtGwei(baseGasPrice)}`);
        return;
    }

    const methodId = getMethodIdFromInputData(tx.data);

    if (!isNeededMethodId(methodId)) {
        console.error(`Unsupported swap method`);
        return;
    }

    try {
        await executeFrontRunSwap(tx, swapHandlers[methodId], tx.to);
    } catch (err) {
        console.error(err);
        state.resetActiveFrontrun();
    }
}

const executeFrontRunSwap = async (tx: ethers.providers.TransactionResponse, handler: ISwapHandler, addressTo: string) => {
    if (state.hasActiveFrontrun()) {
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