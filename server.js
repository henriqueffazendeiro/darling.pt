require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mongoose = require('mongoose');

// Configuração do transporter logo no início
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Verificar conexão do email
transporter.verify(function(error, success) {
    if (error) {
        console.error('Erro na configuração do email:', error);
    } else {
        console.log('Servidor de email pronto para enviar mensagens');
    }
});

const app = express();

// Conectar ao MongoDB
mongoose.connect(process.env.MONGODB_URI);

// Schema para as páginas personalizadas
const PageSchema = new mongoose.Schema({
    sessionId: String,
    pageData: {
        coupleNames: String,
        startDate: String,
        message: String,
        theme: String,
        images: [String],
        youtubeUrl: String  // Changed from musicUrl to youtubeUrl
    },
    createdAt: { type: Date, default: Date.now }
});

const Page = mongoose.model('Page', PageSchema);

// Add this after existing schemas
const DiscountSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    percentOff: { type: Number, required: true },
    active: { type: Boolean, default: true },
    expiresAt: Date,
    stripeId: String
});

const Discount = mongoose.model('Discount', DiscountSchema);

// Add helper function at top level
function compressImageData(imageData) {
    // Get only first 1MB of image data if too large
    if (imageData && imageData.length > 1000000) { // 1MB limit
        return imageData.substring(0, 1000000);
    }
    return imageData;
}

// Add this helper function at the top of your file
function getYoutubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// Middleware exclusivo para o Webhook - deve vir antes de qualquer outro middleware
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];

    try {
        // Use o corpo bruto diretamente
        const event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_ENDPOINT_SECRET
        );

        console.log('Evento recebido e validado:', event.type);

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            console.log('Session details:', session); // Debug log

            // Get email from customer_details
            const email = session.customer_details?.email;
            console.log('Email do cliente:', email);

            if (!email) {
                console.error('E-mail não encontrado na sessão:', session.customer_details);
                return res.status(400).json({ error: 'E-mail não encontrado.' });
            }

            // Adicionar retry logic para esperar os dados
            let attempts = 0;
            const maxAttempts = 5;
            let page = null;

            while (attempts < maxAttempts) {
                page = await Page.findOne({ sessionId: session.id });
                if (page) break;
                
                console.log(`Tentativa ${attempts + 1}: Aguardando dados da página...`);
                await new Promise(resolve => setTimeout(resolve, 0)); // Espera 2 segundos
                attempts++;
            }

            if (!page) {
                console.error('Página não encontrada após várias tentativas:', session.id);
                return res.status(400).json({ error: 'Página não encontrada após várias tentativas.' });
            }

            const link = `${process.env.BASE_URL}/pagina-criada/${session.id}`;
            console.log('Link gerado:', link);
            
            // Generate QR code with higher quality and larger size
            const qrCodeDataURL = await QRCode.toDataURL(link, {
                width: 300,
                margin: 2,
                errorCorrectionLevel: 'H',
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Sua Página Personalizada Está Pronta!',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    </head>
                    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h1 style="color:rgb(250, 75, 75); text-align: center;">Obrigado pela sua compra!</h1>
                        <p style="font-size: 16px; text-align: center;">A sua página personalizada está pronta.</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <img src="${qrCodeDataURL}" alt="QR Code" style="width: 250px; height: 250px; display: inline-block;"/>
                        </div>
                        <p style="text-align: center; margin-top: 20px;">
                            <a href="${link}" style="background-color: rgb(250, 75, 75); color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Clique aqui para acessar sua página</a>
                        </p>
                        <p style="text-align: center; color: #7f8c8d; margin-top: 20px;">
                            Ou acesse diretamente a este link:<br>
                            <a href="${link}" style="color: rgb(250, 75, 75); word-break: break-all;">${link}</a>
                        </p>
                    </body>
                    </html>
                `,
                attachDataUrls: true // Important: enables data URL images
            };

            // Enviar email e aguardar resposta
            const info = await transporter.sendMail(mailOptions);
            console.log('Email enviado com sucesso:', info.response);
        }

        res.json({ received: true });
    } catch (err) {
        console.error('Erro no webhook:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
    }
});

// Middleware global para outras rotas (após o webhook)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// Rota para criar sessão de checkout do Stripe
app.post('/create-checkout-session', async (req, res) => {
    try {
        console.log('Raw request body:', req.body);
        
        if (!req.body || typeof req.body !== 'object') {
            throw new Error('Request body is invalid');
        }

        const { plan, pageData, discountCode } = req.body;
        
        if (!plan || (plan !== 'basic' && plan !== 'premium')) {
            throw new Error('Plano inválido ou ausente.');
        }

        if (!pageData || !pageData.coupleNames) {
            throw new Error('Dados da página ausentes ou inválidos.');
        }

        let price = plan === 'premium' ? 999 : 499;

        // Create Stripe session configuration
        const sessionConfig = {
            payment_method_types: ['card'],
            allow_promotion_codes: true,
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: `Plano ${plan.charAt(0).toUpperCase() + plan.slice(1)}`,
                    },
                    unit_amount: price,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${process.env.BASE_URL}/success.html`,
            cancel_url: `${process.env.BASE_URL}/cancel.html`,
        };

        // Check for valid discount code
        if (discountCode) {
            const discount = await Discount.findOne({
                code: discountCode,
                active: true,
                expiresAt: { $gt: new Date() }
            });

            if (discount) {
                sessionConfig.discounts = [{
                    coupon: discount.stripeId
                }];
            }
        }

        const session = await stripe.checkout.sessions.create(sessionConfig);

        // Save page data
        const page = new Page({
            sessionId: session.id,
            pageData: {
                coupleNames: pageData.coupleNames,
                startDate: pageData.startDate,
                message: pageData.message,
                theme: pageData.theme,
                images: pageData.images?.map(img => compressImageData(img)) || [],
                youtubeUrl: compressImageData(pageData.youtubeUrl)
            }
        });

        await page.save();
        console.log('Page data saved with sessionId:', session.id);

        res.json({ id: session.id, url: session.url });
    } catch (error) {
        console.error('Checkout session error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rota para salvar os dados da página
app.post('/save-page-data', express.json(), async (req, res) => {
    try {
        const { sessionId, pageData } = req.body;
        console.log('Tentando salvar dados para sessão:', sessionId);
        
        // Compress images before saving
        let compressedImages = [];
        if (pageData.images && Array.isArray(pageData.images)) {
            compressedImages = pageData.images.map(img => compressImageData(img));
        }

        const compressedData = {
            ...pageData,
            images: compressedImages,
            youtubeUrl: compressImageData(pageData.youtubeUrl)
        };

        // Verificar se já existe uma página com este sessionId
        let page = await Page.findOne({ sessionId });
        if (page) {
            console.log('Atualizando página existente');
            page.pageData = compressedData;
            await page.save();
        } else {
            console.log('Criando nova página');
            page = new Page({ sessionId, pageData: compressedData });
            await page.save();
        }
        
        console.log('Dados salvos com sucesso');
        res.json({ success: true });
    } catch (error) {
        console.error('Erro detalhado ao salvar dados da página:', error);
        res.status(500).json({ 
            error: 'Erro ao salvar dados da página',
            details: error.message 
        });
    }
});

// Move this BEFORE all other routes
app.use(express.static('public'));

// Add this new middleware to handle all routes
app.use((req, res, next) => {
    // If the request is for a static file or API endpoint, continue normally
    if (req.url.startsWith('/api') || req.url.includes('.')) {
        return next();
    }
    // Otherwise, treat it as a potential dynamic route
    next();
});

// Update the route to handle both direct and wildcard access
app.get(['/pagina-criada/:sessionId', '/*'], async (req, res) => {
    try {
        // Extract sessionId from params or from the URL path
        const sessionId = req.params.sessionId || req.path.split('/').pop();
        
        // If no sessionId is found, return 404
        if (!sessionId) {
            return res.status(404).send('Página não encontrada');
        }

        const page = await Page.findOne({ sessionId: sessionId });
        if (!page) {
            return res.status(404).send('Página não encontrada');
        }

        console.log('Dados completos da página:', JSON.stringify(page, null, 2));

        if (!page.pageData) {
            console.error('pageData está indefinido:', page);
            return res.status(500).send('Erro: Dados da página estão incompletos');
        }

        // Get the required data from pageData
        const { theme = 'light', message = '', youtubeUrl = '', images = [] } = page.pageData;
        const relationshipDate = page.pageData.startDate?.split('T')[0] || new Date().toISOString().split('T')[0];
        const relationshipTime = page.pageData.startDate?.split('T')[1] || '00:00';

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <link href="https://fonts.googleapis.com/css2?family=Rubik&display=swap" rel="stylesheet">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    #loading-screen {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background-color: #1f2022;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        z-index: 9999;
                    }

                    .loader {
                        position: relative;
                        width: 40px;
                        height: 60px;
                        animation: heartBeat 1.2s infinite cubic-bezier(0.215, 0.61, 0.355, 1);
                        margin: 0 auto;
                    }

                    .loader:before, .loader:after {
                        content: "";
                        background: red;
                        width: 40px;
                        height: 60px;
                        border-radius: 50px 50px 0 0;
                        position: absolute;
                        left: 0;
                        bottom: 0;
                        transform: rotate(45deg);
                        transform-origin: 50% 68%;
                        box-shadow: 5px 4px 5px #0004 inset;
                    }

                    .loader:after {
                        transform: rotate(-45deg);
                    }

                    @keyframes heartBeat {
                        0% { transform: scale(0.95); }
                        5% { transform: scale(1.1); }
                        39% { transform: scale(0.85); }
                        45% { transform: scale(1); }
                        60% { transform: scale(0.95); }
                        100% { transform: scale(0.9); }
                    }

                    #loading-text {
                        color: white;
                        margin-top: 40px;
                        font-family: 'Rubik', sans-serif;
                    }

                    #main-content {
                        display: none;
                    }
                    
                    /* Rest of your existing styles */
                    body { 
                        margin-top: 35px; 
                        font-family: 'Rubik', sans-serif; 
                        text-align: center; 
                        background-color: ${theme === 'dark' ? '#1f2022' : '#ffffff'};  
                    }
                    
                    .time { 
                        font-size: 4vw; 
                        margin: 4vw 0; 
                        color: ${theme === 'dark' ? 'white' : 'black'}; 
                    }
                    .message { 
                        color: ${theme === 'dark' ? '#ffffff' : '#000000'}; 
                        font-size: 4vw; 
                        line-height: 1.4; 
                        max-width: 80%; 
                        margin: 0 auto; 
                        word-wrap: break-word; 
                        overflow-wrap: break-word; 
                        margin-top: 15px;
                        white-space: pre-line; /* Adicione esta linha */
                    }
                    .together-text { 
                        font-weight: bold; 
                        margin-right: 1vw; 
                        color: ${theme === 'dark' ? '#ffffffb0' : '#000000b0'}; 
                        font-size: 4vw; 
                    }
                    @keyframes rise-bubble {0% {bottom: -50px;opacity: 0;transform: translateX(0);}10% {opacity: 1;transform: translateX(-10px);}30% {transform: translateX(10px);}50% {transform: translateX(-6px);}70% {transform: translateX(6px);}90% {opacity: 1;transform: translateX(-0px);}100% {bottom: 100%;opacity: 0;transform: translateX(0px);}}
                    .bubble {z-index: 9999; position: absolute;bottom: -50px;opacity: 0;animation: rise-bubble 5s ease-in-out forwards;}
                    .heart-large {font-size: 60px;left: 75%;animation-delay: 1s;color: red;}
                    .heart-medium {font-size: 50px;left: 42%;animation-delay: 1.5s;color: red;}
                    .heart-small {font-size: 40px;left: 7%;animation-delay: 0.5s;color: red;}
                    .bubble.heart-small {animation-delay: 0.5s;}
                    .bubble.heart-medium {animation-delay: 1.5s;}
                    .bubble.heart-large {animation-delay: 1s;}
                    #image-slideshow {
                            width: 75vw;
                            height: 110vw;
                            margin: 4vw auto;
                            overflow: hidden;
                            position: relative;
                            border-radius: 3vw;
                        }
                    #image-slideshow img {
                            width: 100%;
                            height: 100%;
                            object-fit: cover;
                            object-position: center;
                            position: absolute;
                            top: 0;
                            left: 0;
                            
                        }

                    .preview-heart-emoji {
                        color: #FF0000;
                        position: relative;
                        left: 50%;
                        transform: translateX(-50%);
                        margin-bottom: 2vw;
                        font-size: 5vw;
                        /* Keep any existing styles for vertical positioning */
                    }
                    
                    .separator{
                        width: 70%;
                        margin-top: 15px;
                     }

                    .mus{
                        margin: 6vw auto;
                        

                    }

                    #youtube-iframe{
                        margin-top: 60px;
                    }
                </style>
            </head>
            <body>
                <div id="loading-screen">
                    <div class="loader"></div>
                    <div id="loading-text">Toque para abrir</div>
                </div>

                <div id="main-content">
                    <!-- Your existing content -->
                    <div id="image-slideshow"></div>
                    <span class="together-text">Juntos há</span>
                    <div class="time" id="love-time"></div>
                    <div class="preview-bubbles">
                        <div class="bubble heart-small">❤️</div>
                        <div class="bubble heart-medium">❤️</div>
                        <div class="bubble heart-large">❤️</div>
                    </div>

                     <div class="preview-heart-emoji">❤️</div>

                    <hr class="separator">
                    <div class="message" style="white-space: pre-line;">${message}</div>
                    ${page.pageData.youtubeUrl ? `
                        <div id="youtube-player"></div>
                        <script>
                            // Force autoplay with direct iframe first
                            document.write(\`
                                <iframe 
                                    id="youtube-iframe"
                                    width="100%" 
                                    height="80" 
                                    src="https://www.youtube.com/embed/${getYoutubeId(page.pageData.youtubeUrl)}?autoplay=1&mute=0&controls=1&loop=1&playlist=${getYoutubeId(page.pageData.youtubeUrl)}&playsinline=1&enablejsapi=1" 
                                    allow="autoplay; encrypted-media" 
                                    allowfullscreen
                                    style="border: none;">
                                </iframe>
                            \`);

                            // Then load YouTube API for additional control
                            var tag = document.createElement('script');
                            tag.src = "https://www.youtube.com/iframe_api";
                            var firstScriptTag = document.getElementsByTagName('script')[0];
                            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

                            var player;
                            function onYouTubeIframeAPIReady() {
                                player = new YT.Player('youtube-iframe', {
                                    events: {
                                        'onReady': function(event) {
                                            event.target.playVideo();
                                            event.target.unMute();
                                            event.target.setVolume(100);
                                            
                                            // Keep trying to play
                                            setInterval(() => {
                                                if (event.target.getPlayerState() !== YT.PlayerState.PLAYING) {
                                                    event.target.playVideo();
                                                    event.target.unMute();
                                                }
                                            }, 1000);
                                        },
                                        'onStateChange': function(event) {
                                            if (event.data !== YT.PlayerState.PLAYING) {
                                                event.target.playVideo();
                                                event.target.unMute();
                                            }
                                        }
                                    }
                                });
                            }

                            // Additional autoplay attempts
                            function forcePlay() {
                                const iframe = document.getElementById('youtube-iframe');
                                if (iframe) {
                                    iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
                                    if (player && player.playVideo) {
                                        player.playVideo();
                                        player.unMute();
                                        player.setVolume(100);
                                    }
                                }
                            }

                            // Try multiple times to start playback
                            window.addEventListener('load', forcePlay);
                            document.addEventListener('DOMContentLoaded', forcePlay);
                            setTimeout(forcePlay, 1000);
                            setTimeout(forcePlay, 2000);
                            setTimeout(forcePlay, 3000);

                            // Try to play on any user interaction
                            document.addEventListener('click', forcePlay);
                            document.addEventListener('touchstart', forcePlay);
                        </script>
                    ` : ''}

                </div>

                <script>
                    // Add click handler for loading screen
                    document.getElementById('loading-screen').addEventListener('click', function() {
                        this.style.display = 'none';
                        document.getElementById('main-content').style.display = 'block';
                        
                        // Start all your existing functionality
                        updateLoveTime();
                        showNextImage();
                        triggerHeartAnimation();
                        if (typeof player !== 'undefined' && player.playVideo) {
                            player.playVideo();
                            player.unMute();
                        }
                    });

                    // Add this to the beginning of your script section
                    window.addEventListener('load', function() {
                        setTimeout(function() {
                            document.querySelector('.loading-container').classList.add('fade-out');
                        }, 2000); // Show loading for 2 seconds
                    });

                    function updateLoveTime() {
                        const startDate = new Date("${relationshipDate}T${relationshipTime}");
                        const now = new Date();
                        const diff = now - startDate;
                        const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
                        const months = Math.floor((diff % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24 * 30));
                        const days = Math.floor((diff % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));
                        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                        document.getElementById('love-time').innerHTML = \`<strong>\${years}</strong> anos, <strong>\${months}</strong> meses, <strong>\${days}</strong> dias, <strong> <br> \${hours} </strong> horas, <strong>\${minutes}</strong> minutos, <strong>\${seconds}</strong> segundos\`;                }
                    setInterval(updateLoveTime, 1000);

                    const images = ${JSON.stringify(images)};
                    let currentImageIndex = 0;
                    const imageSlideshow = document.getElementById('image-slideshow');
                    function showNextImage() {
                        if (images.length > 0) {
                            const img = document.createElement('img');
                            img.src = images[currentImageIndex];
                            imageSlideshow.innerHTML = '';
                            imageSlideshow.appendChild(img);
                            currentImageIndex = (currentImageIndex + 1) % images.length;
                        }
                    }
                    setInterval(showNextImage, 5000);
                    showNextImage();

                    function triggerHeartAnimation() {
                        const bubbles = document.querySelectorAll('.bubble');
                        const order = [0, 2, 1]; // Small, Large, Medium
                        bubbles.forEach((bubble, index) => {
                            bubble.style.animation = 'none';
                            bubble.offsetHeight; // Trigger reflow
                            bubble.style.animation = \`rise-bubble 5s ease-in-out forwards \${order[index] * 0.5}s\`;
                        });
                    }

                    // Trigger the animation when the page loads
                    window.addEventListener('load', triggerHeartAnimation);

                    // Repeat the animation every 15 seconds
                    setInterval(triggerHeartAnimation, 15000);
                        

                    document.addEventListener('DOMContentLoaded', function() {
                        const audio = document.querySelector('audio');
                        if (audio) {
                            audio.play().catch(e => console.log("Audio play failed:", e));
                        }
                    });

                    window.addEventListener('load', function() {
                        const audio = document.querySelector('audio');
                        if (audio) {
                            document.body.addEventListener('click', function() {
                                audio.play().catch(e => console.log("Audio play failed:", e));
                            }, { once: true });
                        }
                    });
                        
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Erro ao servir página:', error);
        res.status(500).send('Erro ao carregar a página');
    }
});

app.get('/couples/:id', async (req, res) => {
    try {
        const pageData = await db.collection('pages').findOne({ _id: req.params.id });
        if (!pageData) {
            return res.status(404).send('Page not found');
        }
        res.render('couple-page', { pageData });
    } catch (error) {
        res.status(500).send('Server error');
    }
});

app.post('/checkout-success', async (req, res) => {
    const { sessionId } = req.body;
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const pageData = JSON.parse(session.metadata.pageData);
    
    const result = await db.collection('pages').insertOne(pageData);
    const pageId = result.insertedId;
    
    res.redirect(`/couples/${pageId}`);
});

// Add new route to validate discount codes
app.post('/validate-discount', async (req, res) => {
    try {
        const { code } = req.body;
        const discount = await Discount.findOne({
            code,
            active: true,
            expiresAt: { $gt: new Date() }
        });

        if (discount) {
            res.json({
                valid: true,
                percentOff: discount.percentOff
            });
        } else {
            res.json({
                valid: false,
                message: 'Código de desconto inválido ou expirado'
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Modify the admin route to create discount in both MongoDB and Stripe
app.post('/admin/create-discount', async (req, res) => {
    try {
        // First create the coupon in Stripe
        const stripeCoupon = await stripe.coupons.create({
            name: 'FREE100',
            id: 'FREE100',
            percent_off: 100,
            duration: 'once',
        });

        // Then save in MongoDB
        const fullDiscount = new Discount({
            code: 'FREE100',
            percentOff: 100,
            active: true,
            expiresAt: new Date('2024-12-31'),
            stripeId: stripeCoupon.id
        });
        
        await fullDiscount.save();
        
        res.json({ 
            success: true, 
            message: 'Discount code created successfully',
            coupon: stripeCoupon
        });
    } catch (error) {
        if (error.stripeId) {
            try {
                await stripe.coupons.del(error.stripeId);
            } catch (deleteError) {
                console.error('Error deleting Stripe coupon:', deleteError);
            }
        }
        res.status(500).json({ error: error.message });
    }
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
