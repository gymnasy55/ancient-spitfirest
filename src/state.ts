import { ethers } from "ethers";

export default {
    frontrunningTransaction: undefined,
    hasActiveFrontrun() { return this.frontrunningTransaction !== undefined },
    resetActiveFrontrun(): void {
        this.frontrunningTransaction = undefined;
    }
} as AppState;

interface AppState {
    frontrunningTransaction?: ethers.ContractTransaction,
    hasActiveFrontrun(): boolean,
    resetActiveFrontrun(): void;
}   