// Import files
const pathjs = require('path');
const crypto = require('crypto');
const fs = require('fs');
const monerojs = require('monero-javascript');
const {
  parentPort
} = require('worker_threads');
// Config Vars
const walletFileStr = './wallets.json';
const logFile = './monero.log';
const walletFile = fs.readFileSync(walletFileStr);
// Wallet binaries storage
const WALLETS_PATH = pathjs.join(__dirname, 'wallets');

// const mainNet = 'http://uwillrunanodesoon.moneroworld.com:18089';
const mainNet = 'http://opennode.xmr-tw.org:18089'
const DAEMON_URL = mainNet;
const {
  MoneroNetworkType
} = monerojs;

// ---- Utilities ----------- 
const createRandomHash = () => {
  return mnemonicHasher(Math.random().toString())
}
const mnemonicHasher = (mnemonic) => {
  return crypto.createHash('sha256').update(mnemonic).digest('base64').replace(/[^a-zA-Z ]/g, "");
}

const errorMsgWrapper = (msg) => ({
  response: 'error',
  message: msg,
})

const writeToLog = (msg) => {
  const timeStamp = new Date();
  const writeMsg = `${timeStamp.toISOString()} - ${msg}\n`
  fs.appendFileSync(logFile, writeMsg);
}


function atomicToXMR(val) {
  const xmrFormat = BigInt(+val * (Math.pow(10, 12)));
  return xmrFormat;
}

// ---- End Utilities ----------- 


/**
 * Pass wallets currently being synced in the global
 * node variable of the server
 * 
 * @param { global wallets } syncedWallets
 * @param { client Wallets} clientWallets
 */
class MoneroWalletsHandler {
  localWallets = [];
  clientWallets = [];
  newSyncedWallets = {};
  openedWallets = {};
  clientId = ''
 

  constructor({
    syncedWallets,
    clientWallets,
    openedWallets
      }) {
    this.updateSyncedWallets(syncedWallets);
    this.updateClientWallets(clientWallets);
    this.updateOpenedWallets(openedWallets)
    this.getExistingWallets();
  }


  // GET / SET Methods
  updateSyncedWallets(syncedWallets) {
    this.syncedWallets = syncedWallets
  }

  updateClientWallets(clientWallets) {
    this.clientWallets = clientWallets;
  }

  updateOpenedWallets(openedWallets) {
    this.openedWallets = openedWallets
  }

  updateWalletsJson(newWalletList) {
    this.localWallets = newWalletList;
    this.writeToJSONFile();
  }


  writeToJSONFile() {
    fs.writeFileSync(walletFileStr, JSON.stringify(this.localWallets), (err) => {
      if (err) console.log('Failed to save file. Error: ' + err);
    });
  }

  async setNewSyncedWallets() {
    const promises = Promise.all(
      this.syncedWallets.map(async (openedWallet) => {
        const mnemonicHash = mnemonicHasher(await openedWallet.getMnemonic());
        this.newSyncedWallets = {
          ...this.newSyncedWallets,
          [mnemonicHash]: openedWallet,
        }
      })
    );
    const result = await promises;
    return result;
  }

  getNewSyncedWallets() {
    return this.newSyncedWallets;
  }

  getClientWallets() {
    return this.clientWallets
  }

  getWalletsJson() {
    return this.localWallets
  }

  getOpenedWallets() {
    return this.openedWallets
  }

  /**
   * Get all locally managed / saved WASMs
   */
  async getExistingWallets() {
    this.localWallets = JSON.parse(walletFile);
  }
  // END  GET / SET Methods

  /**
   * Check if a wallet with a specific hash is saved locally
   * @param {string} walletHash 
   */
  checkIfWalletExists(walletHash) {
    return this.localWallets.some(wallet => wallet.walletHash === walletHash);
  }

  /**
   * Check if a wallet is already syncing in the Synced Wallets
   * @param {string} walletHash 
   */
  checkIfWalletIsSynced(walletHash) {
    return Object.keys(this.syncedWallets).includes(walletHash);

    return this.syncedWallets.some(wallet => wallet.walletHash === walletHash);

  }

  /**
   * Check if walletId is already part of the client wallets to be displayed
   * @param {string} walletId 
   */
  checkIfWalletIsDisplayed(walletId) {
    return this.clientWallets.some(wallet => wallet.wallet_id === walletId);
  }

  /**
   * Get the necessary details to be displayed
   * @param {opened wallet wasm} openedWallet 
   */
  getDisplayDetails(openedWallet) {
    return;
    // return {
    //   path: 
    //   mnemonic:
    //   recoveryHeight:
    //   address:
    //   balance:
    //   creationDate:

    // }
  }

  /**
   * API Entry point for Creating Wallets
   * Should be smart enough to determine if:
   * 1. Add an already synced wallet to the clients wallets
   * 2. Open a WASM that is saved locally and add it to the clients wallets
   * 3. Create a new wallet and add it to the synced wallets and locally saved wallets
   * 
   * @param {string} walletId (Required) as this would stand as the name of the wallet for display
   * @param {string} mnemonic (optional) Mnemonic seed to recover a wallet
   * @param {string} recoveryHeight  (optional) Block Height for recovery
   * 
   */
  async onCreateWalletRequest(walletId, mnemonic, recoveryHeight) {
    // return error when there's no walletId provided
    return new Promise(async (resolve, reject) => {
      if (!walletId) {
        return reject(errorMsgWrapper('Should provide a walletId'));
      }

      // End function when the walletId is already displayed
      if (this.checkIfWalletIsDisplayed(walletId)) {
        return reject(errorMsgWrapper(`Wallet_id: [${walletId}] is alrady being used`));
      }

      // Create new wallet if only the walletId is provided
      if (!mnemonic || !recoveryHeight) {
        this.createNewWallet(walletId);
        return resolve(this.syncedWallets)
      }

      const walletIdHash = mnemonicHasher(mnemonic);
      if (this.checkIfWalletExists(walletIdHash)) {
        // If requested wallet is already in the synced global variable then add the synced
        // wallet with the mnemonic hash as the key else Open the wallet if not synced ;
        if (this.checkIfWalletIsSynced(walletIdHash)) {
          this.clientWallets.push(this.getSyncedWalletData(walletIdHash));
        } else {
          await this.openExistingWallet(walletIdHash, walletId);
        }

        resolve(this.clientWallets);

      } else {
        // If wallet does not exist in List of Locally managed Wallets
        // Then Recover Wallet since user gave mnemonic and recovery height
        await this.createNewWallet(walletId, mnemonic, recoveryHeight);
        // resolve(this.syncedWallets);
        //Since the wallets are not synced to respond to UI, it will be synced after the function is resolved,
        resolve(this.clientWallets);
      }
    })
  }

  /**
   * Create new wallet when there is no mnemonic / height given
   */
  async createNewWallet(walletId, mnemonic, restoreHeight) {
    const pathName = mnemonic ? mnemonicHasher(mnemonic) : createRandomHash(8);

    const walletConfig = {
      path: pathjs.join(WALLETS_PATH, pathName),
      password: createRandomHash(),
      networkType: MoneroNetworkType.MAINNET,
      serverUri: DAEMON_URL,
      mnemonic: mnemonic || undefined,
      restoreHeight: +restoreHeight || undefined,
    };

    let newWallet = await monerojs.createWalletWasm(walletConfig);


    newWallet.isSyncing = true;
    const clientId = this.clientId;
    parentPort.postMessage({
      query: 'syncProgress',
      data: {isSyncing: true, progress:0},
      clientId
    })
    await newWallet.sync(new class extends monerojs.MoneroWalletListener {
    // newWallet.addListener(new class extends monerojs.MoneroWalletListener {
      onSyncProgress(height, startHeight, endHeight, percentDone, message) {

        // parentPort.postMessage(returnWrapper(percentDone*100, 'syncProgress'));
        parentPort.postMessage({
          query: 'syncProgress',
          data: {isSyncing: true, progress:percentDone*100},
          clientId
        })
        if (height % 10000 === 0) {
          writeToLog(`Create Progress: ${height} |  ${percentDone * 100}% | ${message}`);
        }
        if (percentDone === 1) {
          writeToLog(`Wallet Synced: ${height} |  ${percentDone * 100}% | ${message}`);
          parentPort.postMessage({
            query: 'syncProgress',
            data: {isSyncing: false, progress:percentDone*100},
            clientId
          })
          newWallet.save();
        }
      }
    });
    await newWallet.startSyncing();
    let walletMnemonic = await newWallet.getMnemonic();
    const address = await newWallet.getAddress(0, 0);
    const balance = (await newWallet.getBalance(0, 0));
    this.updateOpenedWallets({...this.openedWallets, [pathName]: newWallet})
    // this.openedWallets[walletMnemonic] = newWallet
    const walletInfo = {
      walletHash: mnemonicHasher(walletMnemonic),
      mnemonic,
      address,
      balance: balance.toString(),
      transactions: [],
      creationDate: Date.now(),
      ...walletConfig,
    };

    //The wallets are not synced in this method to improve the UI/UX
    if (!this.syncedWallets[walletInfo.walletHash]) {
      this.syncedWallets[walletInfo.walletHash] = newWallet;
    }

    this.updateClientWallets([
      ...this.clientWallets,
      {
        ...walletInfo,
        wallet_id: walletId,
      },
    ]);

    this.updateWalletsJson([
      ...this.localWallets,
      walletInfo,
    ]);
  }

  getSyncedWalletData(walletHash) {
    return this.syncedWallets.find(wallet => wallet.walletHash === walletHash);
  }

  getSavedWalletData(walletHash) {
    return this.localWallets.find(wallet => wallet.walletHash === walletHash);
  }

  /**
   * Open wallet that is already in the list of locally managed wallets
   * / saved WASMs
   * 
   * @param {string} walletId 
   * @param {string} recoveryHeight 
   */
  async openExistingWallet(walletHash, walletId) {
    const savedWalletData = this.getSavedWalletData(walletHash);

    const walletConfig = {
      path: savedWalletData.path,
      networkType: MoneroNetworkType.MAINNET,
      serverUri: DAEMON_URL,
      password: savedWalletData.password,
    };

    const openedWallet = await monerojs.openWalletWasm(walletConfig);
    this.updateOpenedWallets({...this.openedWallets, [walletHash]: openedWallet})
    const mnemonic = await openedWallet.getMnemonic();
    writeToLog("mnemonic from moerojs is" + mnemonic)
    
    // Additional Data to show
    // End Additional Data to show
  //   await openedWallet.startSyncing();
  //  await openedWallet.addListener(new class extends monerojs.MoneroWalletListener {
  //     onSyncProgress(height, startHeight, endHeight, percentDone, message) {
  //       if (height % 10000 === 0) {
  //         writeToLog(`Opening Progress: ${height} |  ${percentDone * 100}% | ${message}`);
  //         console.log(`Opening Progress: ${height} |  ${percentDone * 100}% | ${message}`);
  //       }
  //       if (percentDone === 1) {
  //       // await openedWallet.save();
  //       writeToLog(`Progess: ${height} |  ${percentDone * 100}% | ${message}`)
  //       }
  //     }
  //     onOutputSpent(output) {
  //       console.log(output);
  //     }
  //   });

    if (!this.syncedWallets[mnemonicHasher(mnemonic)]) {
      this.syncedWallets[mnemonicHasher(mnemonic)] = openedWallet;
    }

    // this.updateOpenedWallets({...this.openedWallets, [mnemonic]: openedWallet})
    // this.openedWallets[mnemonic] = openedWallet
    const transactions = await openedWallet.getTxs();
    this.updateClientWallets([
      ...this.clientWallets,
      {
        ...savedWalletData,
        wallet_id: walletId,
        balance: (await openedWallet.getBalance(0, 0)).toString(),
        transactions: transactions.length,
      },
    ]);
    return openedWallet;
  }

 async syncWallets(returnWrapper) {
      // Additional Data to show
    // End Additional Data to show
    const openedWallets = this.getOpenedWallets()
    writeToLog("Into the sync wallets calls")
    console.log('opened wallets are', openedWallets);
    console.log('opened wallets are from this are', this.openedWallets);
    // writeToLog(JSON.stringify(openedWallets))
    if(openedWallets){
      writeToLog("Opened Wallets exists for sure");
      Object.keys(openedWallets).forEach( async (prop) => {

        writeToLog("Into the sync wallets calls and props is"+ prop);
     
        const openedWallet = openedWallets[prop];
        const mnemonic = await openedWallet.getMnemonic();
        writeToLog("Into the sync wallets calls and props numenic from wallet is"+ await openedWallet.getMnemonic())
     await openedWallet.startSyncing();
    await openedWallet.addListener(new class extends monerojs.MoneroWalletListener {
       onSyncProgress(height, startHeight, endHeight, percentDone, message) {
         parentPort.postMessage(returnWrapper(percentDone));
         if (height % 10000 === 0) {
           writeToLog(`Opening Progress: ${height} |  ${percentDone * 100}% | ${message}`);
           console.log(`Opening Progress: ${height} |  ${percentDone * 100}% | ${message}`);
         }
         if (percentDone === 1) {
         // await openedWallet.save();
         writeToLog(`Progess: ${height} |  ${percentDone * 100}% | ${message}`)
         }
       }
       onOutputSpent(output) {
         console.log(output);
       }
     });

      })
    if (!this.syncedWallets[mnemonicHasher(mnemonic)]) {
      this.syncedWallets[mnemonicHasher(mnemonic)] = openedWallet;
    }
  }
}

  async onImportWallets(walletsToImport, clientId) {
  this.clientId = clientId;
    if (!walletsToImport || !walletsToImport.length) return [];
    for (var x = 0;x < walletsToImport.length;x++) {
      const {
        wallet_id,
        mnemonic,
        restoreHeight
      } = walletsToImport[x];
      await this.onCreateWalletRequest(wallet_id, mnemonic, restoreHeight);
    }
  
  }

  transactionFormatter(transact) {
    // console.log('transact is',transact);
    if (!transact) return;
    let finalTransaction = {
      ...transact.state
    };
    // instantiate new blocks and transaction removing the deep nested
    const block = transact.state.block && transact.state.block.state;
    const transaction = transact.state.incomingTransfers ? transact.state.incomingTransfers[0].state : transact.state.outgoingTransfer.state;

    delete finalTransaction.block;
    delete finalTransaction.incomingTransfers;
    delete transaction.tx
    if (block) delete block.txs

    finalTransaction = {
      ...finalTransaction,
      block,
      transaction,
      fee: finalTransaction.fee.toString(),
      amount: transaction.amount.toString(),
    };
    return finalTransaction;
  }

  async getTransactions(walletHash) {
    const wallet = this.syncedWallets[walletHash];
    writeToLog("Into the Get Transcation Method for wallet" + walletHash)
    const transactions = await wallet.getTxs();
    writeToLog("Transactions fetched");

    const promises = Promise.all(transactions.map(tx =>
      new Promise(async (resolve) => {
        resolve({
          ...this.transactionFormatter(tx)
        })
      })
    ));

    const result = await promises;
    return result;
  }

  async sendTransaction(walletHash, txParams) {
    return new Promise(async (resolve, reject) => {
      try {
        const wallet = this.syncedWallets[walletHash];
        const {
          recipient,
          priority,
          amount
        } = txParams;
        let createdTx = await wallet.createTx({
          address: recipient,
          priority: +priority,
          accountIndex: 0,
          amount: atomicToXMR(amount), // (denominated in atomic units)
          relay: true // create transaction and relay to the network if true
        });
        wallet.save();
        resolve(createdTx.toJson());
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = {
  MoneroWalletsHandler,
  mnemonicHasher
};