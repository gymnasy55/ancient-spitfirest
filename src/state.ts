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
        console.log('Frontrun is completed'.cyan)
        this.frontrunningTransaction = undefined;
    }
} as AppState;


export const frontrunStarted = () => {
    // TODO
}

export const frontrunFinishedWithError = () => {
    frontrunFinished();
}

export const frontrunFinishedSuccessfully = () => {
    frontrunFinished();
}


const frontrunFinished = () => {

}

export default state