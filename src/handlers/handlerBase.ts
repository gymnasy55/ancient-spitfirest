import { ethers } from "ethers";
import { UniswapRouterV2 } from "../../out/typechain";

export interface ITxHandler {
    handleSwap(): Promise<void>;
    getFunctionSignature(): string;
    getMethodId(): string;
    getFunctionName(): string;
}

export abstract class TxHandlerBase implements ITxHandler {
    public getFunctionName(): string {
        const signature = this.getFunctionSignature()
        return signature.substr(0, signature.indexOf('('),);
    }

    abstract handleSwap(): Promise<void>;
    abstract getFunctionSignature(): string;
    abstract getMethodId(): string;
}