import { ethers } from "ethers";

interface AppState {
    frontrunningTransaction?: ethers.ContractTransaction,
    hasActiveFrontrun(): boolean,
    resetActiveFrontrun(): void;
}

const state = {
    frontrunningTransaction: undefined,
    hasActiveFrontrun() { return this.frontrunningTransaction !== undefined },
    resetActiveFrontrun(): void {
        console.log('RESET!');
        this.frontrunningTransaction = undefined;
    }
} as AppState;

export default state