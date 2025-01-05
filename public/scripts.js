// Atualiza o preview, validação do formulário e seleção de plano
document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.getElementById('file-input');
    const dateInput = document.getElementById('relationship-date');
    const timeInput = document.getElementById('relationship-time');
    const messageInput = document.getElementById('message');
    const createPageButton = document.getElementById('create-page-button');
    const priceOptions = document.querySelectorAll('.price-option');

    // Função para selecionar o plano
    function selectPrice(element) {
        priceOptions.forEach(option => option.classList.remove('selected'));
        element.classList.add('selected');
        
        // Atualizar a visibilidade do input de música
        const musicUpload = document.querySelector('.music-upload');
        if (element.id === '2') {
            musicUpload.style.display = 'block';
        } else {
            musicUpload.style.display = 'none';
        }
    }

    // Adicionar evento de clique para cada opção de preço
    priceOptions.forEach(option => {
        option.addEventListener('click', () => {
            selectPrice(option);
        });
    });

    // Verificar parâmetro na URL e selecionar plano apropriado
    const urlParams = new URLSearchParams(window.location.search);
    const planParam = urlParams.get('plan');
    
    if (planParam === 'premium') {
        const premiumOption = document.getElementById('2');
        if (premiumOption) {
            selectPrice(premiumOption);
        }
    } else {
        // Selecionar plano básico por padrão
        const basicOption = document.getElementById('1');
        if (basicOption) {
            selectPrice(basicOption);
        }
    }

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
});

// Gerencia o redirecionamento para o checkout
document.getElementById('create-page-button').addEventListener('click', async (event) => {
    event.preventDefault();

    const selectedPlanElement = document.querySelector('.price-option.selected');
    const plan = selectedPlanElement ? (selectedPlanElement.id === '2' ? 'premium' : 'basic') : 'basic';

    try {
        const response = await fetch('/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan,
                email: null, // Ajuste para enviar e-mail válido se necessário
            }),
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

