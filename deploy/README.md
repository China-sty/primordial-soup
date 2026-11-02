# 部署配置

这两份是从服务器上取下来的实际配置，改动服务器时请同步更新到仓库。

## nginx

`primordialsoupai.conf` → 放到 `/etc/nginx/sites-available/primordialsoupai`，
再软链到 `sites-enabled/`：

```bash
ln -sf /etc/nginx/sites-available/primordialsoupai /etc/nginx/sites-enabled/primordialsoupai
nginx -t && systemctl reload nginx
```

证书路径由 certbot 管理（`/etc/letsencrypt/live/primordialsoupai.com/`），
续期用 `certbot renew`，`certbot.timer` 已启用。

## systemd

`primordial-soup.service` → 放到 `/etc/systemd/system/primordial-soup.service`：

```bash
systemctl daemon-reload
systemctl restart primordial-soup
```

服务以 `soup` 用户运行，`ProtectSystem=strict`，只能写 `/opt/primordial-soup`。
如果目录属主不对：

```bash
chown -R soup:soup /opt/primordial-soup
```
