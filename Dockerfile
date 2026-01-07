FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json /app/
RUN npm ci

COPY . /app

ARG VITE_API_BASE_URL=https://api.v1.krisskrossskate.com
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build:docker

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
