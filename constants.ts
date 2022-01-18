import { utils, ethers } from "ethers";
import { NetworkInfoConfig, Networks } from './src/types/networkInfo';
import { JsonRpcProvider } from '@ethersproject/providers';
import { env } from 'process';
import { uniV2Handlers } from './src/handlers/uniV2/factories';
import { getTokensListForNetwork } from './src/helpers';

export const chainId = env.CHAIN_ID;
export const curNetwork = chainId as unknown as Networks;

const networkConfigs: NetworkInfoConfig = {
    [97]: {
        swapRouterAddresses: ['0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3'],
        allowedFrontRunTokens: getTokensListForNetwork(chainId),
        stableUsd: { address: '0x7ef95a0fee0dd31b22626fa2e10ee6a223f8a684', decimals: 18 },
        wethAddress: { address: '0xae13d989dac2f0debff460ac112a837c89baa7cd', decimals: 18 },
        methodsConfig: {
            swapExactEthForTokens: {
                minTxEthValue: utils.parseEther('0.01'),
                maxFREthValue: utils.parseEther('0.01')
            }
        },
        frUnitAddress: '',
        handlers: {
            ['0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3']: {
                factories: uniV2Handlers
            } // pancake
        }
    }
}

export const provider: JsonRpcProvider = new ethers.providers.WebSocketProvider(env.WS_PROVIDER);
export const signer = new ethers.Wallet(env.PRIVATE_KEY, provider);
export const network = networkConfigs[curNetwork];

if (!network) throw new Error("Unsupported chain id");