# Conta Conjunta — Firebase v0.3

Aplicação web/PWA independente para gestão financeira de casal. Esta base **não compartilha código, banco, autenticação, regras ou deploy com o SIG**.

## Firebase conectado

- Project ID: `contaconjunta-224f9`
- Auth domain: `contaconjunta-224f9.firebaseapp.com`
- Configuração Web: `firebase-config.js`

A configuração Web do Firebase é pública por definição. A proteção efetiva dos dados está no Firebase Authentication e nas Firestore Security Rules.

## Estado desta baseline

- Firebase Authentication por e-mail e senha.
- Criação de unidade financeira do casal (`household`).
- Segundo usuário por código com validade de 7 dias.
- Limite de dois usuários por casal.
- Firestore isolado por `householdId`.
- Contas financeiras.
- Receitas e despesas pessoais ou compartilhadas.
- Realizado e previsto.
- Dashboard mensal.
- Extrato consolidado.
- Fluxo de caixa D+30.
- Orçamento mensal por categoria.
- Importação OFX com proteção contra duplicidade.
- PWA instalável.

## Estrutura do Firestore

```
users/{uid}
households/{householdId}
  accounts/{accountId}
  categories/{categoryId}
  transactions/{transactionId}
  budgets/{month_categoryId}
  cards/{cardId}
  investments/{investmentId}
  reserves/{reserveId}
  ofxImports/{hash}
invites/{code}
joinClaims/{uid}
```

## Segurança

As regras oficiais da baseline estão em `firestore.rules`. O Firestore do projeto já deve usar essa versão publicada; qualquer mudança futura nas regras deve ser versionada aqui e publicada de forma deliberada no Firebase.

## Teste funcional recomendado

1. Criar o primeiro usuário escolhendo **Criar nossa Conta Conjunta**.
2. Confirmar no Firestore a criação de `users`, `households`, conta principal e categorias.
3. Criar uma receita e uma despesa.
4. Conferir Dashboard, Extrato e saldo da conta.
5. Em Configurações, gerar o código do casal.
6. Abrir outro navegador/telefone e criar o segundo usuário escolhendo **Entrar com código do casal**.
7. Confirmar sincronização entre os dois acessos.
8. Importar um OFX pequeno e repetir a importação para validar a proteção contra duplicidade.

## Próximos blocos

1. Cartões: faturas, fechamento, vencimento, parcelas e pagamento.
2. OFX: aprendizado de categoria por histórico/descrição.
3. Reservas e investimentos com evolução patrimonial.
4. Orçamento com recorrências e alertas.
5. Testes automatizados das Firestore Rules.
