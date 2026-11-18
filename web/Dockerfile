FROM nginxinc/nginx-unprivileged:1.27-alpine

# Image déjà non-root (uid 101) et écoute sur 8080
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.js /usr/share/nginx/html/

EXPOSE 8080
