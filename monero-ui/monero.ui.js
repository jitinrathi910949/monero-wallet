let managedWallet = {};
let allWallets = [];
// Websocket handler




  // const ws = new WebSocket('ws://194.5.249.210/:8080')
  
  let ws = null

  function messageServer(data) {
    console.log(data);
    if (ws.readyState === WebSocket.OPEN) {
      if (!data.query) {
        toastr.warning('Error: No query param sent')
        addToLog('Error: No query param sent');
        return
      }
      toastr.info('Please wait while we fetch the requested data')
      ws.send(JSON.stringify(data));
      
    } else {
      toastr.error('Server connection lost / error')
      addToLog('Server connection lost / error');
    }
  }

  const socketOpenListener = () => {
      // Actual init()
    addToLog('Connected to server');
    $('#not-connected').hide(500);
    $('#connecting').hide(500);
    $('#connected').show(500)
  }

  const socketErrorListener = () => {
    if (ws) {
      console.error('Disconnected.');
    }
    $('#not-connected').show(500);
    $('#connecting').hide(500);
    $('#connected').hide(500);
  
    setTimeout(() => {
      ws = new WebSocket('ws://localhost:8080');
      ws.addEventListener('open', socketOpenListener);
      ws.addEventListener('message', socketMessageListener);
      ws.addEventListener('error', socketErrorListener);
    }, 5000);
  }

  // Functions to pinpoint specific UI functions per Server query
  const responseHandler = (jsonString) => {
    const {
      query,
      data
    } = JSON.parse(jsonString);
    console.log(JSON.parse(jsonString));
    if(query !== 'syncProgress')
    toastr.success('Successful')

    switch (query) {
      case 'importWallets':
        return getWalletsHandler(data.getClientWallets);
      case 'getTransactions':
        return getWalletDetailsHandler(data);
      case 'sendTransaction':
        return sendTransactionHandler(data);
      case 'syncProgress':
        console.log('sync progress', data);
        return sendProgressHandler(data);
        break;
    }
  }

  const socketMessageListener = (e) => {
    responseHandler(e.data);
  }
// Standard Websocket handler function
if (("WebSocket" in window)) {
  socketErrorListener()
} else {
  addToLog('Websockets are not supported');
}

// Page Handlers

// General Sections Handler

/**
 * Function to change pages upon clicking the side menu.
 */
const sections = ['wallets', 'send-payment', 'transactions']

function pageSwitcher(selectedSection) {
  sections.forEach(section => {
    $(`#${section}`).css('display', 'none')
  });
  $(`#${selectedSection}`).css('display', 'block')
}
pageSwitcher(sections[0]) // Initialize the section to show at first



// Utilities
/**
 * Logging function -> can be modified to log into a log file. 
 * @param {string} msg 
 */
const addToLog = (msg) => {
  console.log(msg)
}

/**
 * Convert to monero readable format
 * @param {BigInt} atomic 
 */
const atomicConverter = (atomic) => {
  const xmrFormat = +atomic * (Math.pow(10, -12));
  return xmrFormat.toFixed(12);
}


/**
 * Convert serialized array to JSON
 * @param {serialized array} data 
 */
const dataSerializer = (data) => {
  return data.reduce((accum, elem) => {
    accum[elem.name] = elem.value;
    return accum
  }, {});
};

/**
 * Utility to check for missing data
 * @param {object} data 
 * @param {array} requiredKeys 
 */
const dataValidator = (data, requiredKeys) => {
  let msg = '';
  requiredKeys.forEach(key => {
    if (!data[key]) msg = `${msg} ${key}`;
  });
  return msg ? `Required keys : [ ${msg} ] are missing` : '';
}

/**
 * return index within all wallets
 * @param {string} walletId 
 */
const walletIndexFinder = (walletId) => {
  return allWallets.findIndex(wallet => wallet.wallet_id === walletId);
}

/**
 * Get wallet in All Wallets by checking the given key if it matches the data
 * @param {key, data} query 
 */
const allWalletsQuery = (query) => {
  const {
    key,
    data
  } = query;
  return allWallets.find(wallet => wallet[key] === data);
}
// ----- End Utilities


// Wallets Section JS
const walletTable = $('#wallets-table').DataTable({
  columnDefs: [{
    targets: -1,
    sortable: false,
  }]
});

const getWalletsHandler = (wallets) => {
  allWallets = wallets;
  walletTable.clear().draw();
  $('.wallets-dropdown').empty();
  $('#sendpayment-wallet').empty();

  wallets.forEach(wallet => {
    const {
      wallet_id,
      address,
      balance,
      transactions,
      creationDate,
    } = wallet;
    const myDate = new Date(creationDate);


    // Wallets section table population
    walletTable.row.add(
      [
        wallet_id,
        `<p title="${address}" class="address-field">${address}</p>`,
        balance ? `${atomicConverter(balance)} XMR` : 0,
        transactions,
        myDate.toLocaleString() || 'N/A',
        `<span> <a href="javascript:void(0)" class="form-btn btn btn-info" onclick="sendPaymentClickHandler('${wallet_id}')"> Send Payment </a>
        <a <a href="javascript:void(0)" class="form-btn btn btn-success" onclick="viewHistoryClickHandler('${wallet_id}')"> Transaction History </a> </span>`
      ]
    ).draw(false);


    // Transactions Wallets Dropdown population
    $('.wallets-dropdown').append(
      `<option value="${wallet_id}"> ${wallet_id} </option>`
    )

    // Send Payment dropdown population
    $('#sendpayment-wallet').append(
      `<option value="${wallet_id}"> ${wallet_id} (${atomicConverter(balance)}) </option>`
    )
  })
}

const viewHistoryClickHandler = (walletId) => {
  pageSwitcher('transactions');
  $('#transaction-wallet').val(walletId).change();
}

const sendPaymentClickHandler = (walletId) => {
  $('#sendpayment-wallet').val(walletId).change();
  pageSwitcher('send-payment');
}

const viewSwitcher = (viewToShow) => {
  const views = [
    'walletsview-table',
    'walletsview-import',
    'walletsview-export',
  ];

  views.forEach(view => {
    $(`#${view}`).removeClass(['hide-div', 'show-div']);
    $(`#${view}-btn`).removeClass(['hide-div', 'show-btn']);

    if (`${view}-btn` === viewToShow) {
      $(`#${view}`).addClass('show-div');
      $(`#${view}-btn`).addClass('hide-div');
    } else {
      $(`#${view}`).addClass('hide-div');
      $(`#${view}-btn`).addClass('show-btn');
    }
  });

  if (viewToShow === 'walletsview-export-btn') {
    let displayWallets = JSON.stringify(allWallets, undefined, 2);
    if(allWallets && allWallets.length === 0)
    displayWallets = 'There is no wallet to export'
    $('#wallets-json-export').text(displayWallets);
  }
}

$(`.walletpage-view`).click(function (e) {
  console.log(e.target.id);
  viewSwitcher(e.target.id);


});

const filterImports = (walletsToImport) => {
  const result = walletsToImport.filter(importWallet =>
    allWallets.find(wallet =>
      (
        wallet.mnemonic === importWallet.mnemonic ||
        wallet.wallet_id === importWallet.wallet_id
      )
    ));
  return result;
}

$('#import-wallets').submit(e => {
  e.preventDefault();
  const rawData = $('#import-wallets').serializeArray();
  const message = dataSerializer(rawData);

  messageServer({
    query: 'importWallets',
    params: JSON.parse(message.walletsJson),
  });
  return false;
})



// End Wallets Section JS
// ------------------------------------------------------------------
// Transaction Section JS

const transactionsTable = $('#transactions-table').DataTable({
  columnDefs: [{
    targets: -1,
    sortable: false,
  }]
});

function getWalletDetailsHandler(data) {
  const transactions = data;
  if (!transactions || !transactions.length) return;
  transactions.forEach(transaction => {
    console.log(transaction);
    const {
      hash,
      amount,
      fee,
      block,
      numConfirmations
    } = transaction;
    const blockDate = block ?
      new Date(block.timestamp * 1000).toLocaleString() // Converting timestamp
      :
      'Relaying';
    // `<p title="${address}" class="address-field">${address}</p>`,
    transactionsTable.row.add(
      [
        `<p title="${hash}" class="address-field">${hash}</p>`,
        amount ? `${atomicConverter(amount)} XMR` : `0 XMR`,
        fee ? `${atomicConverter(fee)} XMR` : `0 XMR`,
        block ? block.height : 'Relaying',
        numConfirmations,
        `${blockDate}`
      ]
    ).draw(false);
  })
}

$('#transaction-wallet').change(function (e) {
  e.preventDefault();
  transactionsTable.clear().draw();
  const currentWallet = $(this).val();
  managedWallet = allWallets[walletIndexFinder(currentWallet)]
  messageServer({
    query: 'getTransactions',
    params: managedWallet,
  });
  console.log(`Checking for updates`);
})


// End Transactions Section JS

const sendTransactionHandler = (data) => {
  console.log(data);
}

const sendProgressHandler = (data) => {

  const {isSyncing, progress} = data;
  if(isSyncing){
  $('#syncProgress').css('display', 'flex');
  $('.progress').css('display', 'flex');
  $('#syncProgress').css("width",`${progress}%`).attr('aria-valuenow', progress);
} else {
  $('#syncProgress').css('display', 'none');
  $('.progress').css('display', 'none');
}

}


// ---- Sending transaction JS

$('#sendTransaction').submit(function (e) {
  e.preventDefault();
  const rawData = $('#sendTransaction').serializeArray();
  const message = dataSerializer(rawData);
  const errorMsg = dataValidator(message, ['recipient', 'amount', 'priority']);

  // Error validation 
  if (errorMsg) {
    alert(errorMsg);
    return false;
  }
  if (isNaN(+message.amount)) {
    alert('Amount is not valid');
    return false;
  }

  if (+managedWallet.balance < +atomicConverter(+message.amount)) {
    alert('Amount is not valid');
    return false;
  }

  if (confirm('Confirm Send?')) {
    messageServer({
      query: 'sendPayment',
      params: {
        ...message,
        wallet: managedWallet
      }
    });
  }

  return false;
});

$('#sendpayment-wallet').change(function () {
  // Change the wallet balance text on dropdown update
  const currentWallet = $(this).val();
  managedWallet = allWallets[walletIndexFinder(currentWallet)];
  $(`#send-balance`).text(`${atomicConverter(managedWallet.balance)} XMR`)
})
// ---- end Sending transaction JS

$('#createNewWallet').submit(function (e) {
  e.preventDefault();
  $('#createNewModal').modal('toggle');
  const wallet_id = $('#newWalletId').val();
  messageServer({
    query: 'createNewWallet',
    params: {
      wallet_id
    }
  });
  $('#newWalletId').val('');
})

// end new wallet
