import { BigNumber } from "@ethersproject/bignumber";
import { utils, ethers } from "ethers";
import { INetworkInfoConfig } from "./src/types/networkInfo";
import { SwapExactEthForTokensHandler } from './src/swapHandlers/swapExactEthForTokens';
import { JsonRpcProvider } from '@ethersproject/providers';
import { env } from 'process';
import { ISwapHandler } from "./src/swapHandlers/swapHandlerBase";

const getTokensListForNetwork = (networkId: number) => {
    return require(`./tokensList/${networkId}.json`) as string[];
}

export const networkConfigs: INetworkInfoConfig = {
    [1]: { // ethereum mainnet
        swapRouterAddresses: ['0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'],
        stableUsd: { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
        wethAddress: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
        methodsConfig: {
            swapExactEthForTokens: {
                minTxEthValue: utils.parseEther('1'),
                maxFREthValue: utils.parseEther('0.1')
            }
        },
        tokensList: []//getTokensListForNetwork(1)
    },
    [4]: { // rinkeby
        swapRouterAddresses: ['0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'],
        stableUsd: { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
        wethAddress: { address: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6', decimals: 18 },
        methodsConfig: {
            swapExactEthForTokens: {
                minTxEthValue: utils.parseEther('1'),
                maxFREthValue: utils.parseEther('0.1')
            }
        },
        tokensList: []//getTokensListForNetwork(1)
    },
    [5]: { // goerli
        swapRouterAddresses: ['0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'],
        stableUsd: { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
        wethAddress: { address: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6', decimals: 18 },
        methodsConfig: {
            swapExactEthForTokens: {
                minTxEthValue: utils.parseEther('1'),
                maxFREthValue: utils.parseEther('0.1')
            }
        },
        tokensList: []//getTokensListForNetwork(5)
    }
}

interface IMethod {
    [methodId: string]: ISwapHandler;
}

export const swapHandlers: IMethod = {
    //    ['0xfb3bdb41']: 'swapETHForExactTokens(uint256,address[],address,uint256)',
    ['0x7ff36ab5']: new SwapExactEthForTokensHandler(), //'swapExactETHForTokens(uint256,address[],address,uint256)',
}

export const provider: JsonRpcProvider = new ethers.providers.WebSocketProvider(env.WS_PROVIDER);
export const signer = new ethers.Wallet(env.PRIVATE_KEY, provider);
export const network = networkConfigs[env.CHAIN_ID];
