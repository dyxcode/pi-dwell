# Web design preview

From the repository root, after installing dependencies:

```sh
node examples/web-preview/serve.mjs
```

Open http://127.0.0.1:8791 and choose **Standalone** or **With Distill** in the sidebar. The preview shares the production stylesheet. Session status, responses, and memory are examples stored only in the current browser tab. It does not connect to Pi or Distill.

The production Web client supports standalone conversations. The Distill layout is an integration design preview; its memory search and session coordination still need a real extension contract.
