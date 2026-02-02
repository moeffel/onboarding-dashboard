# SSL Certificate Instructions

Place the production `fullchain.pem` and `privkey.pem` files in this directory before running `docker-compose.prod.yml`.

These files are mounted read-only into the nginx container so that HTTPS terminates at the proxy. Keep the certificates out of version control and rotate them regularly.
