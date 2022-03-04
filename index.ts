import figlet from "figlet";
import app from "./src/app";
import bn from "bignumber.js";

const APP_NAME = 'Spitfirest BOT';

(async () => {
    figlet(APP_NAME, (_, data) => {
        console.log(data);
        // executed here, to prevent logo appearance after 
        // app start executing
        app();
    })
})();