import { utils, ethers } from "ethers";
import { NetworkInfoConfig, Networks } from './src/types/networkInfo';
import { JsonRpcProvider } from '@ethersproject/providers';
import { env } from 'process';
import { uniV2Handlers } from './src/handlers/uniV2/factories';
import { getTokensListForNetwork } from './src/helpers';
import { NonceManager } from './src/services/nonceManager';

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
        frUnitAddress: '0xeb28B488382a27c98C2114F461AFF0350AC19686',
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
export const nonceManager = new NonceManager(provider, signer.address);

if (!network) throw new Error("Unsupported chain id");