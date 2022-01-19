import { provider, } from '../../constants';
import { Wallet } from "ethers";
import { JsonRpcProvider } from '@ethersproject/providers';

export class NonceManager {
    private baseNonce: Promise<number>;
    private nonceOffset: number = 0;

    constructor(provider: JsonRpcProvider, address: string) {
        this.baseNonce = provider.getTransactionCount(address);
    }

    public getNonce(): Promise<number> {
        return this.baseNonce.then((nonce) => (nonce + (this.nonceOffset++)));
    }
}