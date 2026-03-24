# Arcadia Grid Linux 部署文档

本文基于当前仓库结构编写，适用于把项目部署到一台常规 Linux 服务器。

当前项目结构：

- 前端：纯静态页面，入口文件为 `index.html`
- 后端：NestJS + Socket.IO，默认监听 `3001`
- 健康检查：`GET /health`

## 1. 推荐部署方式

推荐使用下面的结构：

- `nginx` 负责对外提供 `80/443`
- `nginx` 直接托管前端静态文件
- `nginx` 反向代理 `/socket.io` 和 `/health` 到 Node 后端
- `systemd` 守护 Node 后端进程

这样浏览器只访问一个域名，不需要额外暴露 `3001` 端口。

## 2. 服务器准备

以 Ubuntu 为例：

```bash
sudo apt update
sudo apt install -y nginx curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

建议 Node 版本：

- Node.js 20 LTS 或更高

## 3. 上传项目

把项目上传到服务器，例如：

```bash
sudo mkdir -p /srv/arcadia-grid
sudo chown -R $USER:$USER /srv/arcadia-grid
```

然后将本地项目内容同步到：

```bash
/srv/arcadia-grid
```

如果你使用 Git，可以直接：

```bash
cd /srv
git clone <你的仓库地址> arcadia-grid
cd /srv/arcadia-grid
```

## 4. 安装依赖并构建后端

进入项目目录：

```bash
cd /srv/arcadia-grid
npm ci
npm run build:backend
```

说明：

- 当前前端没有单独打包步骤，`index.html`、`main.js`、`styles.css`、`src/` 等文件直接作为静态资源提供
- 当前前端还依赖 `node_modules/socket.io-client/dist/socket.io.esm.min.js`
- 因此生产环境中静态目录不能只复制 `index.html` 和 `src/`，必须保留项目目录中的 `node_modules/socket.io-client`

## 5. 配置前端联机地址

项目根目录新增了 `config.js`，默认内容如下：

```js
window.__ARCADIA_CONFIG__ = window.__ARCADIA_CONFIG__ || {};
```

当前逻辑：

- 本地开发环境 `http://127.0.0.1:4173` 会自动连接 `:3001`
- 生产环境默认连接当前站点同源地址
- 如果你要把后端部署到独立域名或独立端口，可以修改 `config.js`

例如后端仍然单独暴露在 `3001`：

```js
window.__ARCADIA_CONFIG__ = {
  serverUrl: "http://your-server-ip:3001"
};
```

如果你按本文推荐方案使用 `nginx` 反向代理，同源部署时通常不需要改这个文件。

## 6. 配置 systemd 启动后端

创建服务文件：

```bash
sudo nano /etc/systemd/system/arcadia-grid.service
```

填入以下内容：

```ini
[Unit]
Description=Arcadia Grid Nest Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/arcadia-grid
ExecStart=/usr/bin/node /srv/arcadia-grid/dist/main.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3001
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

启动并设置开机自启：

```bash
sudo systemctl daemon-reload
sudo systemctl enable arcadia-grid
sudo systemctl start arcadia-grid
sudo systemctl status arcadia-grid
```

查看日志：

```bash
sudo journalctl -u arcadia-grid -f
```

## 7. 配置 nginx

创建站点配置：

```bash
sudo nano /etc/nginx/sites-available/arcadia-grid
```

示例配置：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /srv/arcadia-grid;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:3001/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/arcadia-grid /etc/nginx/sites-enabled/arcadia-grid
sudo nginx -t
sudo systemctl reload nginx
```

## 8. 如果要启用 HTTPS

推荐使用 Certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

完成后，浏览器访问：

```text
https://your-domain.com
```

## 9. 部署后验证

先检查后端健康状态：

```bash
curl http://127.0.0.1:3001/health
```

期望返回类似：

```json
{"ok":true,"service":"arcadia-grid-room-server","timestamp":1710000000000}
```

再检查站点首页：

```bash
curl -I http://127.0.0.1
```

最后在浏览器中验证：

- 首页能正常打开
- 单机模式可运行
- 切到“联机模式”后能正常建立房间
- 第二个浏览器标签页通过 `?room=房间号` 能加入同一房间

## 10. 常见问题

### 10.1 页面打开了，但联机失败

优先检查：

- `arcadia-grid.service` 是否正常运行
- `nginx` 是否正确代理了 `/socket.io/`
- `config.js` 是否把 `serverUrl` 指到了错误地址
- 浏览器控制台是否存在 WebSocket 或 CORS 报错

### 10.2 修改代码后如何更新

常规更新流程：

```bash
cd /srv/arcadia-grid
git pull
npm ci
npm run build:backend
sudo systemctl restart arcadia-grid
sudo systemctl reload nginx
```

如果你不是通过 Git 更新，就把新文件同步到服务器后再执行：

```bash
npm ci
npm run build:backend
sudo systemctl restart arcadia-grid
```

## 11. 最小上线清单

上线前至少确认以下几点：

- `npm ci` 成功
- `npm run build:backend` 成功
- `dist/main.js` 已生成
- `config.js` 配置正确
- `systemd` 服务正常启动
- `nginx -t` 校验通过
- `/health` 可访问
- 联机模式可建立房间并完成双端连接
