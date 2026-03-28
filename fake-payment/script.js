document.addEventListener('DOMContentLoaded', () => {

    // ── Read URL query params ──────────────────────────────────────────────
    const params    = new URLSearchParams(window.location.search);
    const pollId    = params.get('pollId')    || '';
    const amount    = params.get('amount')    || '0';
    const rawTitle  = params.get('title')     || 'Document Print';
    const title     = decodeURIComponent(rawTitle);

    // ── Inject dynamic data into the UI ──────────────────────────────────
    const amountStr = '₹' + amount + '.00';

    // Pay buttons text
    document.querySelectorAll('.action-btn').forEach(btn => {
        if (btn.textContent.includes('₹150')) {
            btn.textContent = 'Pay ' + amountStr;
        }
    });
    // Amount header
    const amountHeader = document.querySelector('.amount-header h3');
    if (amountHeader) amountHeader.textContent = amountStr;

    // Main page pay button
    const mainPayBtn = document.getElementById('payNowBtn');
    if (mainPayBtn) mainPayBtn.textContent = 'Pay Now ' + amountStr;

    // Item card details
    const itemName = document.querySelector('.item-details h3');
    if (itemName) itemName.textContent = title;
    const itemPrice = document.querySelector('.item-details h4');
    if (itemPrice) itemPrice.textContent = amountStr;

    // Merchant header - update txn
    const txnIdElement = document.getElementById('txnId');
    const generateTxnId = () => 'TXN' + Math.floor(Math.random() * 1000000000000).toString().padStart(12, '0');
    let currentTxnId = generateTxnId();
    if (txnIdElement) txnIdElement.textContent = '#' + currentTxnId.substring(0, 8) + '...';

    // Custom QR image is static, so we don't dynamically overwrite the src
    const qrImg = document.querySelector('.qr-placeholder img');
    const realQrImage = document.getElementById('realQrImage');

    // ── Elements ──────────────────────────────────────────────────────────
    const payNowBtn        = document.getElementById('payNowBtn');
    const paymentModal     = document.getElementById('paymentModal');
    const modalContainer   = document.getElementById('modalContainer');
    const closeIconBtn     = document.getElementById('closeIconBtn');
    const optionTabs       = document.querySelectorAll('.option-tab');
    const sections         = document.querySelectorAll('.section');

    const upiId      = document.getElementById('upiId');
    const payUpiBtn  = document.getElementById('payUpiBtn');

    const cardNumber = document.getElementById('cardNumber');
    const cardExpiry = document.getElementById('cardExpiry');
    const cardCvv    = document.getElementById('cardCvv');
    const cardName   = document.getElementById('cardName');
    const payCardBtn = document.getElementById('payCardBtn');

    const bankItems  = document.querySelectorAll('.bank-item');
    const otherBanks = document.getElementById('otherBanks');
    const payBankBtn = document.getElementById('payBankBtn');

    const processingScreen   = document.getElementById('processingScreen');
    const successScreen      = document.getElementById('successScreen');
    const failedScreen       = document.getElementById('failedScreen');
    const successTxnElement  = document.getElementById('successTxn');

    // Update all pay buttons with correct amount
    [payUpiBtn, payCardBtn, payBankBtn].forEach(btn => {
        if (btn) btn.textContent = 'Pay ' + amountStr;
    });

    // ── New Flow Navigation ───────────────────────────────────────────────
    let countdownInterval;

    window.openPaymentOptions = function () {
        document.querySelectorAll('.gateway-view').forEach(el => el.classList.remove('active'));
        document.getElementById('selectionScreen').classList.add('active');
        
        paymentModal.classList.add('active');
        setTimeout(() => {
            modalContainer.classList.add('show');
            paymentModal.style.opacity = '1';
        }, 10);
    };

    window.startDemoPayment = function () {
        document.querySelectorAll('.gateway-view').forEach(el => el.classList.remove('active'));
        document.getElementById('demoPaymentFlow').classList.add('active');
    };

    window.showQRScreen = function () {
        document.querySelectorAll('.gateway-view').forEach(el => el.classList.remove('active'));
        document.getElementById('qrScreen').classList.add('active');
        
        const qrAmountDisplay = document.querySelector('.qr-amount-display');
        if (qrAmountDisplay) qrAmountDisplay.textContent = 'Amount: ' + amountStr;
        
        startCountdown(5, 0);
    };

    function startCountdown(minutes, seconds) {
        clearInterval(countdownInterval);
        const timerDisplay = document.getElementById('paymentTimer');
        let time = minutes * 60 + seconds;
        
        countdownInterval = setInterval(() => {
            if (time <= 0) {
                clearInterval(countdownInterval);
                return;
            }
            time--;
            let m = Math.floor(time / 60);
            let s = time % 60;
            if(timerDisplay) timerDisplay.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }, 1000);
    }

    window.showUploadScreen = function () {
        document.querySelectorAll('.gateway-view').forEach(el => el.classList.remove('active'));
        document.getElementById('uploadScreen').classList.add('active');
    };

    window.handleUpload = function (event) {
        const file = event.target.files[0];
        if (file && (file.type === 'image/jpeg' || file.type === 'image/png')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                document.getElementById('uploadPlaceholder').style.display = 'none';
                const preview = document.getElementById('uploadPreview');
                preview.src = e.target.result;
                preview.style.display = 'block';
                document.getElementById('submitProofBtn').disabled = false;
            }
            reader.readAsDataURL(file);
        } else {
            alert("Please upload a valid image (JPG or PNG).");
        }
    };

    window.submitRealPayment = function () {
        const h3 = processingScreen.querySelector('h3');
        const oldText = h3.textContent;
        h3.textContent = 'Verifying payment...';
        processingScreen.classList.add('active');

        setTimeout(() => {
            processingScreen.classList.remove('active');
            
            successTxnElement.textContent = 'Txn ID: ' + currentTxnId;
            h3.textContent = oldText; 
            const sH3 = successScreen.querySelector('h3');
            sH3.textContent = 'Payment Submitted Successfully!';
            successScreen.classList.add('active');

            if (window.opener && pollId) {
                const preview = document.getElementById('uploadPreview');
                const imgData = preview ? preview.src : null;
                
                window.opener.postMessage({
                    type: 'PAYMENT_SUCCESS',
                    pollId: pollId,
                    txnId: currentTxnId,
                    amount: amount,
                    proofImage: imgData
                }, window.location.origin);
            }

            setTimeout(() => {
                window.close();
            }, 3000);

        }, 2000);
    };

    // ── Open / Close ──────────────────────────────────────────────────────
    window.openPaymentGateway = function () {
        openPaymentOptions();
    };

    window.closePaymentGateway = function () {
        modalContainer.classList.remove('show');
        paymentModal.style.opacity = '0';
        setTimeout(() => {
            paymentModal.classList.remove('active');
            resetGatewayState();
        }, 300);
    };

    // Auto-open if launched as popup (has pollId param)
    if (pollId) {
        openPaymentGateway();
    }

    payNowBtn.addEventListener('click', openPaymentGateway);
    closeIconBtn.addEventListener('click', closePaymentGateway);

    paymentModal.addEventListener('click', (e) => {
        if (e.target === paymentModal && !processingScreen.classList.contains('active')) {
            closePaymentGateway();
        }
    });

    // ── Tab Switching ─────────────────────────────────────────────────────
    optionTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            optionTabs.forEach(t => t.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.getAttribute('data-target')).classList.add('active');
        });
    });

    // ── Input Validation ──────────────────────────────────────────────────
    upiId.addEventListener('input', (e) => {
        payUpiBtn.disabled = !(e.target.value.includes('@') && e.target.value.length > 4);
    });

    cardNumber.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        e.target.value = value.match(/.{1,4}/g)?.join(' ') || value;
        checkCardValidity();
    });

    cardExpiry.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 2) value = value.substring(0, 2) + '/' + value.substring(2, 4);
        e.target.value = value;
        checkCardValidity();
    });

    cardCvv.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
        checkCardValidity();
    });

    cardName.addEventListener('input', checkCardValidity);

    function checkCardValidity() {
        payCardBtn.disabled = !(
            cardNumber.value.replace(/\s/g, '').length >= 15 &&
            cardExpiry.value.length === 5 &&
            cardCvv.value.length >= 3 &&
            cardName.value.trim().length > 2
        );
    }

    // ── Bank Selection ────────────────────────────────────────────────────
    bankItems.forEach(item => {
        item.addEventListener('click', () => {
            bankItems.forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            otherBanks.value = '';
            payBankBtn.disabled = false;
        });
    });

    otherBanks.addEventListener('change', () => {
        bankItems.forEach(i => i.classList.remove('selected'));
        payBankBtn.disabled = !otherBanks.value;
    });

    // ── Payment Simulation ────────────────────────────────────────────────
    const simulatePayment = () => {
        processingScreen.classList.add('active');

        setTimeout(() => {
            processingScreen.classList.remove('active');

            // 95% success rate (demo)
            const isSuccess = Math.random() > 0.05;

            if (isSuccess) {
                successTxnElement.textContent = 'Txn ID: ' + currentTxnId;
                successScreen.classList.add('active');

                // ✅ Notify parent window (student dashboard) about success
                if (window.opener && pollId) {
                    window.opener.postMessage({
                        type: 'PAYMENT_SUCCESS',
                        pollId: pollId,
                        txnId: currentTxnId,
                        amount: amount
                    }, window.location.origin);
                }

                // Auto-close popup after 3 seconds
                setTimeout(() => {
                    window.close();
                }, 3000);

            } else {
                failedScreen.classList.add('active');
            }

        }, 2500);
    };

    payUpiBtn.addEventListener('click', simulatePayment);
    payCardBtn.addEventListener('click', simulatePayment);
    payBankBtn.addEventListener('click', simulatePayment);

    // ── Reset State ───────────────────────────────────────────────────────
    window.resetGatewayState = function () {
        processingScreen.classList.remove('active');
        successScreen.classList.remove('active');
        failedScreen.classList.remove('active');

        currentTxnId = generateTxnId();
        if (txnIdElement) txnIdElement.textContent = '#' + currentTxnId.substring(0, 8) + '...';
        
        document.getElementById('uploadPlaceholder').style.display = 'block';
        document.getElementById('uploadPreview').style.display = 'none';
        document.getElementById('submitProofBtn').disabled = true;
        document.getElementById('fileInput').value = '';
        
        openPaymentOptions();
    };

});
