# Presença do Embaixador

PWA para celular e computador que registra `data`, `evento` e `presença` na planilha:

https://docs.google.com/spreadsheets/d/1Vufd1iCOEj450pKEfGg7Kz1OiXyx_7ybfj1mubdvFmQ/edit

## Como Funciona

- O app pode ser instalado no celular pelo navegador.
- Os registros ficam salvos no aparelho quando a conexão cai.
- A planilha enviada fica vinculada diretamente no botão `Abrir planilha`.
- A tela não mostra campos técnicos de conexão ou script.

## GitHub Pages

O workflow em `.github/workflows/pages.yml` publica o app no GitHub Pages a cada push na branch `main`.

Endereço esperado:

https://gbpontes22.github.io/Presen-a-/

## Desenvolvimento

```bash
npm install
npm run dev
npm run build
npm run build:github
npm test
```
