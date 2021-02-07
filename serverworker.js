const {
  MoneroWalletsHandler,
} = require('./moneroAPIClass');
const {
  parentPort
} = require('worker_threads');
const writeLogs = require('./writeLogs');

const APIHandler = new MoneroWalletsHandler({
  syncedWallets: {},
  clientWallets: [],
  openedWallets: {}
});


parentPort.on('message', async (msg) => {
  const {
    query,
    params,
    clientId
  } = msg;

  returnWrapper = (data, newQuery) => ({
    query: newQuery || query,
    data,
    clientId
  })
  let result = null;
  switch (query) {
    case 'importWallets':
      APIHandler.onImportWallets(params, clientId)
        .then(async () => {
          writeLogs("importing new wallet with params"+ params);
          result = {
            getClientWallets: await APIHandler.getClientWallets(),
          }
          writeLogs("result from client wallets"+ result);
          parentPort.postMessage(returnWrapper(result));
        // APIHandler.syncWallets((percentDone) => {
        //   parentPort.postMessage(returnWrapper(percentDone, 'syncProgress'))
        // })
        // APIHandler.syncWallets(returnWrapper)
        });
      break;
    case 'getTransactions':
      APIHandler.getTransactions(params.walletHash).then((res) => {
        writeLogs("get Transactions result");
        parentPort.postMessage(returnWrapper(res));
      })
      break;
    case 'exportWallets':
      await APIHandler.getSyncedWallets();
      break;
    case 'sendPayment':
      result = await APIHandler.sendTransaction(params.wallet.walletHash, params);
      parentPort.postMessage(returnWrapper(result));
      break;
    case 'createNewWallet':
      APIHandler.onCreateWalletRequest(params.wallet_id)
        .then(async () => {
          console.log("creating new wallet with params", params.wallet_id);
          result = {
            getClientWallets: await APIHandler.getClientWallets(),
          };
          parentPort.postMessage(returnWrapper(result, 'importWallets'));
        });
      break;
  }
});

