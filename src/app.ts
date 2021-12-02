import { JsonRpcProvider, JsonRpcSigner } from '@ethersproject/providers';
import { ethers, BigNumber, utils } from 'ethers';
import { env } from 'process';
import {
    ERC20__factory,
    UniswapRouterV2__factory
} from '../out/typechain';
import * as constants from '../constants';
import { parseSwapEthInput, SwapEthForTokensInput } from './types/swapEthForTokensInput';

const provider: JsonRpcProvider = new ethers.providers.WebSocketProvider(env.WS_PROVIDER);
const signer = new ethers.Wallet(env.PRIVATE_KEY, provider);
const network = constants.networkConfigs[env.CHAIN_ID];

export default async () => {
    console.log('Started FrontRunning')
    provider.on('pending', handlePendingTransaction);
}

const handlePendingTransaction = async (txHash: string) => {
    const tx = await provider.getTransaction(txHash);

    if (!(tx && tx.to)) {
        console.log(`Invalid tx`);
        return;
    }

    if (!network.swapRouterAddresses.includes(tx.to)) {
        console.log(`Tx 'to' is not a swapRouter. To: ${tx.to}`);
        return;
    }

    if (!isNeededMethodId(tx.data)) {
        console.log(`Unsupported swap method`);
        return;
    }

    if (!validateTransaction(tx)) return;

    await frontRunSwap(tx, tx.to);
}

type FrontRunSwapMethodResult = {
    profit: BigNumber
    txReceipt: ethers.ContractReceipt
}

const frontRunSwap = async (tx: ethers.providers.TransactionResponse, addressTo: string): Promise<FrontRunSwapMethodResult> => {
    console.log('!! Front Run Swap !!')

    const swapRouter = UniswapRouterV2__factory.connect(addressTo, signer);

    const args = getSwapArgumentsFromTx(tx);

    console.log(args);

    const ethBalance = await signer.getBalance();
    const maxEthToSwap = utils.parseEther('0.1');
    // todo check for token balance 
    const ethToSwap =
        ethBalance.gt(maxEthToSwap) ?
            maxEthToSwap :
            ethBalance;

    const receipt = await (await swapRouter.swapExactETHForTokens(0, args.path, signer.address, 0, {
        value: ethToSwap,
        gasPrice: tx.gasPrice?.add(1),
        from: signer.address
    })).wait();

    const balanceAfterSwap = await signer.getBalance();

    return {
        profit: balanceAfterSwap.sub(ethBalance),
        txReceipt: receipt
    };
}

const getSwapArgumentsFromTx = (tx: ethers.providers.TransactionResponse): SwapEthForTokensInput => {
    const signature = constants.swapSupportedMethods[tx.data.substr(0, 10)];
    const functionName = signature.substr(0, signature.indexOf('('),);
    return parseSwapEthInput(UniswapRouterV2__factory.createInterface().decodeFunctionData(functionName, tx.data));
}

const validateTransaction = (tx: ethers.providers.TransactionResponse): boolean => {
    // todo: implement
    return true;
}

const isNeededMethodId = (inputData: string): boolean => {
    if (!inputData || inputData.length < 10) return false;
    return Boolean(constants.swapSupportedMethods[inputData.substr(0, 10)]);
}