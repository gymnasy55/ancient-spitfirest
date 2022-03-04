declare global {
    namespace NodeJS {
        interface ProcessEnv {
            WS_PROVIDER: string,
            PRIVATE_KEY: string,
            CHAIN_ID: number,
            MIN_SLIPPAGE_PERCENTAGE: number,
            MAX_FRONTRUN_SLIPPAGE_PERCENTAGE: number,
            MAX_ETH_TO_SEND_PERCENTAGE: number
        }
    }
}

export { }