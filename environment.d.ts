declare global {
    namespace NodeJS {
        interface ProcessEnv {
            WS_PROVIDER: string,
            PROFIT_ADDRESS: string,
            PRIVATE_KEY: string,
            CHAIN_ID: number,
            MIN_SLIPPAGE_PERCENTAGE: number,
        }
    }
}

export { }