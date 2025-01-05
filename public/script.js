// Atualiza o preview, validação do formulário e seleção de plano
document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.getElementById('file-input');
    const dateInput = document.getElementById('relationship-date');
    const timeInput = document.getElementById('relationship-time');
    const messageInput = document.getElementById('message');
    const createPageButton = document.getElementById('create-page-button');
    const priceOptions = document.querySelectorAll('.price-option');
    const previewContainer = document.querySelector('.preview-image-container');
    let currentSlideInterval; // Add this at the top with other constants

    // Função para validar o formulário
    const validateForm = () => {
        const isFormValid = [fileInput, dateInput, timeInput, messageInput].every(input => {
            if (input.type === 'file') {
                return input.files.length > 0;
            }
            return input.value.trim() !== '';
        });

        createPageButton.disabled = !isFormValid;
        createPageButton.style.opacity = isFormValid ? '1' : '0.5';
        createPageButton.style.cursor = isFormValid ? 'pointer' : 'not-allowed';
    };

    // Função para atualizar o tempo de relacionamento no preview
    const updatePreviewTime = () => {
        if (!dateInput.value || !timeInput.value) {
            document.getElementById('preview-years').textContent = '0';
            document.getElementById('preview-months').textContent = '0';
            document.getElementById('preview-days').textContent = '0';
            return;
        }

        const startDate = new Date(`${dateInput.value}T${timeInput.value}`);
        const now = new Date();
        const diff = now - startDate;

        const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
        const months = Math.floor((diff % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24 * 30));
        const days = Math.floor((diff % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));

        document.getElementById('preview-years').textContent = years;
        document.getElementById('preview-months').textContent = months;
        document.getElementById('preview-days').textContent = days;
    };

    // Função para atualizar a mensagem no preview
    const updatePreviewMessage = () => {
        document.getElementById('preview-message').textContent = messageInput.value;
    };

    // Função para gerenciar a seleção de planos
    const selectPrice = (element) => {
        priceOptions.forEach(option => option.classList.remove('selected'));
        element.classList.add('selected');

        // Get the music upload element
        const musicUpload = document.querySelector('.music-upload');
        // Get the file input and its label
        const fileInput = document.getElementById('file-input');
        const photoLabel = document.getElementById('photo-label');

        if (element.id === '2') {
            // Premium plan
            fileInput.setAttribute('multiple', 'multiple');
            photoLabel.textContent = 'Escolher fotos de casal (máximo 10)';
            musicUpload.style.display = 'block';
        } else {
            // Basic plan
            fileInput.setAttribute('multiple', 'multiple');
            photoLabel.textContent = 'Escolher fotos de casal (máximo 5)';
            musicUpload.style.display = 'none';
        }

        // Stop any existing slideshow
        if (currentSlideInterval) {
            clearInterval(currentSlideInterval);
            currentSlideInterval = null;
        }

        // Clear file input and preview
        fileInput.value = '';
        previewContainer.innerHTML = '';
        
        // Remove navigation buttons if they exist
        const existingButtons = previewContainer.querySelectorAll('.nav-button');
        existingButtons.forEach(button => button.remove());
    };

    priceOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Clear file input and preview
            fileInput.value = '';
            previewContainer.innerHTML = '';
            
            // Update validation state
            validateForm();
            
            // Call existing selectPrice function
            selectPrice(option);
        });
    });

    // Selecionar automaticamente o primeiro price-option ao carregar a página
    const firstPriceOption = document.querySelector('.price-option[id="1"]');
    if (firstPriceOption) {
        selectPrice(firstPriceOption);
    }

    // Check URL parameters for plan selection
    const urlParams = new URLSearchParams(window.location.search);
    const plan = urlParams.get('plan');
    
    // Select the appropriate price option based on URL parameter
    if (plan === 'premium') {
        const premiumOption = document.querySelector('.price-option[id="2"]');
        if (premiumOption) {
            selectPrice(premiumOption);
        }
    } else {
        // Default selection (Basic plan)
        const basicOption = document.querySelector('.price-option[id="1"]');
        if (basicOption) {
            selectPrice(basicOption);
        }
    }

    // Adiciona eventos para validar o formulário e atualizar o preview
    [fileInput, dateInput, timeInput, messageInput].forEach(input => {
        input.addEventListener('input', validateForm);
        input.addEventListener('change', validateForm);
    });

    dateInput.addEventListener('input', updatePreviewTime);
    timeInput.addEventListener('input', updatePreviewTime);
    messageInput.addEventListener('input', updatePreviewMessage);

    // Valida o formulário e atualiza o estado inicial
    validateForm();
    updatePreviewTime();
    updatePreviewMessage();

    // Gerenciar preview de imagens
    fileInput.addEventListener('change', function(e) {
        // Stop any existing slideshow
        if (currentSlideInterval) {
            clearInterval(currentSlideInterval);
            currentSlideInterval = null;
        }

        const maxPhotos = document.querySelector('.price-option.selected').id === '2' ? 10 : 5;
        if (this.files.length > maxPhotos) {
            alert(`Você pode selecionar no máximo ${maxPhotos} fotos neste plano.`);
            this.value = '';
            previewContainer.innerHTML = '';
            return;
        }

        const files = Array.from(e.target.files);
        const previewContainer = document.querySelector('.preview-image-container');
        
        // Remove red border when images are selected
        if (files.length > 0) {
            previewContainer.style.border = 'none';
        }
        
        previewContainer.innerHTML = '';
        let currentIndex = 0;
        let slideInterval;

        function showImage(index) {
            if (files.length === 0) return;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.className = 'preview-image';
                
                // Create new image without removing the old one first
                const newImageContainer = document.createElement('div');
                newImageContainer.appendChild(img);
                
                // Only remove old image after new one is loaded
                previewContainer.innerHTML = newImageContainer.innerHTML;
                
                // Trigger hearts animation when returning to first image
                if (index === 0) {
                    const bubbles = document.querySelectorAll('.bubble');
                    bubbles.forEach((bubble, i) => {
                        bubble.style.animation = 'none';
                        bubble.offsetHeight; // Trigger reflow
                        
                        // Stagger animation based on bubble class
                        let delay = 0;
                        if (bubble.classList.contains('heart-small')) delay = '0.5s';
                        if (bubble.classList.contains('heart-medium')) delay = '1.5s';
                        if (bubble.classList.contains('heart-large')) delay = '1s';
                        
                        bubble.style.animation = 'rise-bubble 5s ease-in-out forwards';
                        bubble.style.animationDelay = delay;
                    });
                }
            };
            reader.readAsDataURL(files[index]);
        }

        function startSlideshow() {
            if (files.length <= 1) return;
            
            // Clear any existing interval before setting a new one
            if (currentSlideInterval) {
                clearInterval(currentSlideInterval);
            }
            
            currentSlideInterval = setInterval(() => {
                currentIndex = (currentIndex + 1) % files.length;
                showImage(currentIndex);
            }, 5000); // Changed to 5 seconds
        }

        function stopSlideshow() {
            if (slideInterval) {
                clearInterval(slideInterval);
            }
        }

        // Show first image and start slideshow
        showImage(0);
        startSlideshow();

        // Add navigation buttons if there are multiple images
        if (files.length > 1) {
            const prevButton = document.createElement('button');
            const nextButton = document.createElement('button');
            prevButton.innerHTML = '&#10094;';
            nextButton.innerHTML = '&#10095;';
            prevButton.className = 'nav-button prev';
            nextButton.className = 'nav-button next';
            
            prevButton.onclick = () => {
                stopSlideshow();
                currentIndex = (currentIndex - 1 + files.length) % files.length;
                showImage(currentIndex);
                startSlideshow();
            };
            
            nextButton.onclick = () => {
                stopSlideshow();
                currentIndex = (currentIndex + 1) % files.length;
                showImage(currentIndex);
                startSlideshow();
            };
            
            previewContainer.appendChild(prevButton);
            previewContainer.appendChild(nextButton);
        }
    });

    // Atualizar contador em tempo real
    function updateRealTimeCounter() {
        const startDate = new Date(`${dateInput.value}T${timeInput.value}`);
        
        function update() {
            const now = new Date();
            const diff = now - startDate;
            
            const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
            const months = Math.floor((diff % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24 * 30));
            const days = Math.floor((diff % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            
            document.getElementById('preview-years').textContent = years;
            document.getElementById('preview-months').textContent = months;
            document.getElementById('preview-days').textContent = days;
            document.getElementById('preview-hours').textContent = hours;
            document.getElementById('preview-minutes').textContent = minutes;
            document.getElementById('preview-seconds').textContent = seconds;
        }
        
        update();
        return setInterval(update, 1000);
    }

    // Iniciar contador quando a data e hora forem definidas
    [dateInput, timeInput].forEach(input => {
        input.addEventListener('change', () => {
            if (dateInput.value && timeInput.value) {
                updateRealTimeCounter();
            }
        });
    });

    // Add music file input handler
    const musicInput = document.getElementById('music-file');
    const previewAudio = document.getElementById('preview-audio');

    musicInput.addEventListener('change', function(e) {
        if (this.files && this.files[0]) {
            const file = this.files[0];
            const audioUrl = URL.createObjectURL(file);
            
            previewAudio.src = audioUrl;
            previewAudio.style.display = 'block';
            previewAudio.play().catch(error => {
                console.log("Audio autoplay failed:", error);
            });
            
            // Clean up the URL when the audio is loaded
            previewAudio.onload = function() {
                URL.revokeObjectURL(audioUrl);
            }
        }
    });

    // Remove the theme selector functionality section
    /*
    const themeBalls = document.querySelectorAll('.theme-ball');
    themeBalls.forEach(ball => {
        ball.addEventListener('click', function() {
            // ... theme switching code ...
        });
    });
    */
});

// Gerencia o redirecionamento para o checkout
/*
document.getElementById('create-page-button').addEventListener('click', async (event) => {
    event.preventDefault();

    const selectedPlanElement = document.querySelector('.price-option.selected');
    const plan = selectedPlanElement ? (selectedPlanElement.id === '2' ? 'premium' : 'basic') : 'basic';

    try {
        const response = await fetch('/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan }),
        });

        const { url } = await response.json();

        if (url) {
            window.location.href = url;
        } else {
            alert('Erro ao criar sessão de pagamento.');
        }
    } catch (error) {
        console.error('Erro ao criar sessão de pagamento:', error);
        alert('Erro ao criar sessão de pagamento.');
    }
});
*/