/* Details -> review -> PIN. Retains the existing Firebase record schema. */
let paymentDraft = null, paymentStage = 'idle', paymentBusy = false, reviewSequence = 0;
const flowEl = id => document.getElementById(id);
function readPaymentAmount(raw, minimum) {
    const text = String(raw).trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Enter an amount with up to two decimal places.');
    const amount = Number(text);
    if (!Number.isSafeInteger(Math.round(amount * 100)) || amount < minimum) throw new Error(`Minimum amount is ${formatINR(minimum)}.`);
    return Math.round(amount * 100) / 100;
}
function balanceOf(user) { const n = Number(user?.balance || 0); if (!Number.isFinite(n) || n < 0) throw new Error('Balance is unavailable. Please refresh your account.'); return n; }
function requirePaymentUser() { if (!currentUser?.accNo) throw new Error('Please sign in again.'); }
function updateOrderSummary() {
    const amount = Number(flowEl('orderAmount').value) || 0;
    flowEl('balanceAfterDisplay').textContent = formatINR(Math.max(0, Number(currentUser?.balance || 0) - amount));
}
function orderCode() {
    if(paymentBusy) return;
    flowEl('orderAmount').value=''; flowEl('currentBalanceDisplay').textContent=formatINR(currentUser?.balance || 0);
    updateOrderSummary(); showModal('orderCodeModal');
}
function payToFriend() {
    if(paymentBusy) return;
    flowEl('friendAccNo').value=''; flowEl('transferAmount').value='';
    flowEl('friendInfo').style.display='none'; flowEl('searchResults').style.display='none';
    flowEl('currentTransferBalance').textContent=formatINR(currentUser?.balance || 0);
    updateTransferSummary(); showModal('payToFriendModal');
}
function submitOrder() { return preparePayment('order'); }
function processTransfer() { return preparePayment('transfer'); }
async function preparePayment(kind) {
    if(paymentBusy) return;
    const source=kind==='order'?'orderCodeModal':'payToFriendModal';
    const button=flowEl(source).querySelector('.modal-footer .btn-primary');
    const sequence=++reviewSequence;
    try {
        requirePaymentUser();
        const amount=readPaymentAmount(flowEl(kind==='order'?'orderAmount':'transferAmount').value,kind==='order'?10:0.01);
        if(amount>balanceOf(currentUser)) throw new Error('Not enough balance. Add funds or lower the amount.');
        const account=kind==='transfer'?flowEl('friendAccNo').value.trim():'';
        if(kind==='transfer' && (!account || /[.#$\[\]\/]/.test(account))) throw new Error('Choose a valid recipient account.');
        if(account===String(currentUser.accNo)) throw new Error('You cannot send money to your own account.');
        paymentBusy=true; button.disabled=true; button.textContent='Checking…';
        let name='Play Code order';
        if(kind==='transfer') {
            const snap=await database.ref('users/'+account).once('value');
            if(!snap.exists()) throw new Error('Recipient not found. Please check the account.');
            name=String(snap.val().fullName || account);
        }
        if(sequence!==reviewSequence || !flowEl(source).classList.contains('show')) return;
        paymentDraft=Object.freeze({kind,amount,account,name,sender:String(currentUser.accNo),source,id:database.ref('transactions').push().key});
        paymentStage='review';flowEl('paymentPin').value='';flowEl('paymentPinForm').hidden=true;
        flowEl('flowRecipient').textContent=name;flowEl('flowAccount').textContent=kind==='transfer'?'Account '+account:'Digital code order';
        flowEl('flowAmount').textContent=formatINR(amount);flowEl('flowBalance').textContent=formatINR(Math.round((balanceOf(currentUser)-amount)*100)/100);
        flowEl('flowTitle').textContent=kind==='transfer'?'Review payment':'Review order';
        flowEl('flowIcon').textContent=kind==='transfer'?'person':'confirmation_number';
        flowEl('flowMessage').textContent='Check these details before you continue.';
        flowEl('flowError').textContent='';flowEl('flowContinue').textContent='Continue →';flowEl('flowContinue').disabled=false;
        flowEl('flowBack').textContent='Edit details';flowEl('flowBack').hidden=false;flowEl('flowBack').disabled=false;
        flowEl('reviewStep').classList.add('active');flowEl('pinStep').classList.remove('active');
        closeModal(source);showModal('transactionFlowModal');flowEl('flowContinue').focus();
    } catch(error) { showAnimatedToast(error.message || 'Unable to check the payment. Try again.','error'); }
    finally {paymentBusy=false;button.disabled=false;button.textContent=kind==='order'?'Review order →':'Review payment →';}
}
function advanceTransactionFlow() {
    if(paymentBusy) return;
    if(['success','uncertain'].includes(paymentStage)) return cancelTransactionFlow();
    if(paymentStage==='pin') return confirmTransaction();
    if(paymentStage!=='review'||!paymentDraft)return;
    paymentStage='pin';flowEl('flowTitle').textContent='Confirm with your PIN';flowEl('paymentPinForm').hidden=false;
    flowEl('flowContinue').textContent=paymentDraft.kind==='order'?'Confirm order':'Confirm payment';
    flowEl('flowMessage').textContent='Confirming will deduct '+formatINR(paymentDraft.amount)+' from your balance.';
    flowEl('reviewStep').classList.remove('active');flowEl('pinStep').classList.add('active');flowEl('paymentPin').focus();
}
function editTransactionDetails() {
    if(paymentBusy || !paymentDraft)return;
    const source=paymentDraft.source;cancelTransactionFlow();showModal(source);
    flowEl(source==='orderCodeModal'?'orderAmount':'friendAccNo').focus();
}
function cancelTransactionFlow() {
    if(paymentBusy)return;
    ++reviewSequence;paymentDraft=null;paymentStage='idle';flowEl('paymentPin').value='';flowEl('paymentPinForm').hidden=true;
    closeModal('transactionFlowModal');
}
async function confirmTransaction() {
    if(paymentBusy||paymentStage!=='pin'||!paymentDraft)return;
    const pin=flowEl('paymentPin').value;
    if(!/^\d{4}$/.test(pin)){flowEl('flowError').textContent='Enter your 4-digit PIN.';return;}
    const draft=paymentDraft;let writeStarted=false;
    paymentBusy=true;flowEl('flowContinue').disabled=true;flowEl('flowBack').disabled=true;flowEl('flowContinue').textContent='Confirming…';flowEl('flowError').textContent='';
    try {
        requirePaymentUser();
        if(String(currentUser.accNo)!==draft.sender)throw new Error('Account changed. Close this payment and start again.');
        const senderSnapshot=await database.ref('users/'+draft.sender).once('value');
        if(!senderSnapshot.exists())throw new Error('Account not found. Please sign in again.');
        const sender=senderSnapshot.val();
        if(String(sender.pin)!==pin)throw new Error('Incorrect PIN. Please try again.');
        if(balanceOf(sender)<draft.amount)throw new Error('Your balance has changed. Add funds or edit the amount.');
        const date=new Date().toISOString(),timestamp=Date.now(),id=draft.id;
        const after=Math.round((balanceOf(sender)-draft.amount)*100)/100;
        const updates={};updates[`users/${draft.sender}/balance`]=after;
        if(draft.kind==='order') {
            const orderId='ORD'+id,transactionId='TX'+id;
            updates[`orders/${orderId}`]={orderId,accNo:draft.sender,fullName:sender.fullName,amount:draft.amount,status:'Pending',date,agentCode:sender.agentCode || ''};
            updates[`transactions/${transactionId}`]={transactionId,accNo:draft.sender,type:'order',amount:draft.amount,description:`Order ${orderId}`,date,balanceAfter:after,referenceId:orderId};
        } else {
            const receiverSnapshot=await database.ref('users/'+draft.account).once('value');
            if(!receiverSnapshot.exists())throw new Error('Recipient is no longer available.');
            const receiver=receiverSnapshot.val();
            if(String(receiver.fullName || draft.account)!==draft.name)throw new Error('Recipient details changed. Go back and review again.');
            const receiverAfter=Math.round((balanceOf(receiver)+draft.amount)*100)/100;
            updates[`users/${draft.account}/balance`]=receiverAfter;
            updates[`transactions/TX${id}S`]={transactionId:`TX${id}S`,accNo:draft.sender,type:'transfer_out',amount:draft.amount,description:`To ${draft.name}`,date,balanceAfter:after};
            updates[`transactions/TX${id}R`]={transactionId:`TX${id}R`,accNo:draft.account,type:'transfer_in',amount:draft.amount,description:`From ${sender.fullName}`,date,balanceAfter:receiverAfter};
            const ntf=(acc,title,message,label,suffix)=>{const nid=`NTF${id}${suffix}`;updates[`userNotifications/${acc}/${nid}`]={id:nid,title,message,iconType:'transaction',createdAt:date,senderLabel:label,read:false,audience:'single',targetAccNo:acc};};
            ntf(draft.account,'Money Received',`${sender.fullName} sent you ${formatINR(draft.amount)}.`,sender.fullName,'R');
            ntf(draft.sender,'Transfer Sent',`You sent ${formatINR(draft.amount)} to ${draft.name}.`,'System','S');
        }
        // Existing backend uses one atomic multi-path update. Server-side balance
        // enforcement is still required for concurrent transactions across devices.
        writeStarted=true;await database.ref().update(updates);
        currentUser.balance=after;paymentStage='success';flowEl('flowIcon').textContent='check_circle';
        flowEl('flowTitle').textContent=draft.kind==='order'?'Order placed':'Money sent';
        flowEl('flowMessage').textContent=draft.kind==='order'?'Your order is pending fulfilment. Track it in My Orders.':'Payment completed. You can find it in Activity.';
        flowEl('paymentPinForm').hidden=true;flowEl('flowBack').hidden=true;flowEl('flowContinue').textContent='Done';
    } catch(error) {
        if(writeStarted) {
            paymentStage='uncertain';flowEl('paymentPinForm').hidden=true;flowEl('flowBack').hidden=true;
            flowEl('flowTitle').textContent='Check payment status';flowEl('flowContinue').textContent='Close';
            flowEl('flowError').textContent='Confirmation was not received. Check My Orders or Activity before trying again to avoid a duplicate payment.';
        } else {flowEl('flowError').textContent=error.message || 'Unable to confirm. Please try again.';flowEl('flowContinue').textContent=draft.kind==='order'?'Confirm order':'Confirm payment';}
    } finally {flowEl('paymentPin').value='';paymentBusy=false;flowEl('flowContinue').disabled=false;flowEl('flowBack').disabled=false;}
}
function syncAppNavigation(page) {
    const pages=['manageAccount','myOrdersSection','transactionHistorySection'];
    document.querySelectorAll('.nav-links .nav-item').forEach((el,i)=>{if(i<3)el.classList.toggle('active',pages[i]===page);});
    document.querySelectorAll('.mobile-dock [data-page]').forEach(el=>el.setAttribute('aria-current',el.dataset.page===page?'page':'false'));
}
// Safe rendering and race-resistant recipient lookup.
let recipientSearchSequence=0;
async function searchUsers() {
    const sequence=++recipientSearchSequence,term=flowEl('friendAccNo').value.trim().toLowerCase();
    flowEl('friendInfo').style.display='none';flowEl('searchResults').replaceChildren();
    if(term.length<2){flowEl('searchResults').style.display='none';return;}
    try {
        if(!Object.keys(allUsersCache).length){const snap=await database.ref('users').once('value');snap.forEach(child=>{const user=child.val();if(user?.accNo)allUsersCache[user.accNo]=user;});}
        if(sequence!==recipientSearchSequence)return;
        displaySearchResults(Object.values(allUsersCache).filter(u=>String(u.accNo).includes(term)||String(u.fullName||'').toLowerCase().includes(term)));
    }catch(e){if(sequence===recipientSearchSequence)showAnimatedToast('Could not search recipients. Please try again.','error');}
}
function displaySearchResults(users) {
    const box=flowEl('searchResults');box.replaceChildren();
    const matches=users.filter(u=>String(u.accNo)!==String(currentUser.accNo)).slice(0,8);
    if(!matches.length){const empty=document.createElement('p');empty.className='search-result-item';empty.textContent='No matching accounts';box.appendChild(empty);}
    matches.forEach(user=>{const item=document.createElement('button');item.type='button';item.className='search-result-item';item.textContent=`${user.fullName} · ${user.accNo}`;item.onclick=()=>{++recipientSearchSequence;flowEl('friendAccNo').value=user.accNo;flowEl('friendName').textContent=`${user.fullName} (${user.accNo})`;flowEl('friendInfo').style.display='block';box.style.display='none';updateTransferSummary();};box.appendChild(item);});box.style.display='block';
}
document.addEventListener('DOMContentLoaded',()=>{
    syncAppNavigation('manageAccount');
    flowEl('paymentPin').addEventListener('input',e=>e.target.value=e.target.value.replace(/\D/g,''));
    document.querySelectorAll('.nav-item[role=button]').forEach(el=>el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}}));
    document.addEventListener('keydown',e=>{
        if(!flowEl('transactionFlowModal').classList.contains('show'))return;
        if(e.key==='Escape'){e.preventDefault();cancelTransactionFlow();}
        if(e.key==='Tab'){const controls=[...flowEl('transactionFlowModal').querySelectorAll('button,input')].filter(el=>!el.disabled&&el.getClientRects().length);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    });
});
