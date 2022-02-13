import figlet from "figlet";
import app from "./src/app";
import bn from "bignumber.js";
import { BigNumber, ethers, utils } from 'ethers';

const APP_NAME = 'Spitfirest BOT';

(async () => {
    figlet(APP_NAME, (err, data) => {
        console.log(data);
    })
    await app();
})();