# Same major as the db image, so pg_dump/pg_restore match the server version.
FROM postgres:17-alpine

RUN apk add --no-cache bash coreutils findutils tar tzdata

ENV TZ=Europe/Ljubljana \
    BACKUP_DIR=/backups \
    STORAGE_DIR=/data/storage \
    BACKUP_RETENTION_DAYS=14 \
    BACKUP_TIME=03:00

COPY lib.sh backup.sh restore.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/entrypoint.sh \
    && mkdir -p /backups /data/storage

VOLUME ["/backups"]

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
