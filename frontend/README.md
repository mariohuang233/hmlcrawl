# 电量监控前端

前端使用 React、TypeScript 与 Vite，开发服务器会把 `/api` 请求代理到 `http://localhost:3000`。

```bash
npm ci
npm run dev
```

生产构建输出到 `frontend/build`，供项目根目录的 Express 服务直接托管。

```bash
npm run build
npm test
```

如需连接其他 API 地址，请设置 `VITE_API_BASE`；值可以是绝对地址或路径前缀，末尾斜杠会被统一处理。
