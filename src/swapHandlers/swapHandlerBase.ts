import { ethers } from "ethers";
import { UniswapRouterV2 } from "../../out/typechain";

export interface ISwapHandler {
    handleSwap(tx: ethers.providers.TransactionResponse, router: UniswapRouterV2): Promise<void>;
    getFunctionSignature(): string;
    getMethodId(): string;
    getFunctionName(): string;
}

export abstract class SwapHandlerBase implements ISwapHandler {
    public getFunctionName(): string {
        const signature = this.getFunctionSignature()
        return signature.substr(0, signature.indexOf('('),);
    }

    abstract handleSwap(tx: ethers.providers.TransactionResponse, router: UniswapRouterV2): Promise<void>;
    abstract getFunctionSignature(): string;
    abstract getMethodId(): string;
}