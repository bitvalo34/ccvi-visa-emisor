SHELL := /bin/bash

# Ejecutar comandos dentro del contenedor de la DB
sh    = MSYS_NO_PATHCONV=1 docker compose exec -T db bash -lc
psqlc = $(sh) 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

.PHONY: db-init db-reset db-psql db-smoke db-recreate

db-init:
	$(sh) 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /app/scripts/sql/001_init.sql'
	$(sh) 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /app/scripts/sql/002_business.sql'

db-reset:
	$(sh) 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -c "DROP SCHEMA IF EXISTS emisor CASCADE;"'
	$(MAKE) db-init

db-psql:
	MSYS_NO_PATHCONV=1 docker compose exec -it db psql -U $${POSTGRES_USER:-app} -d $${POSTGRES_DB:-ccvi}

db-smoke:
	$(sh) 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name='\''emisor'\'';"'

db-recreate:
	docker compose up -d --force-recreate db
