$ErrorActionPreference = 'Stop'
$tag = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$sourceName = "zendix_restore_source_$tag"
$targetName = "zendix_restore_target_$tag"
$createdNames = @()
function Invoke-DevelopmentDocker {
    & docker compose -p zendix -f compose.yaml @args
    if ($LASTEXITCODE -ne 0) { throw 'Restore verification command failed.' }
}
try {
    foreach ($databaseName in @($sourceName, $targetName)) {
        if ($databaseName -notmatch '^zendix_restore_(source|target)_[a-f0-9]{8}$') { throw 'Invalid test database scope.' }
        Invoke-DevelopmentDocker exec -T postgres psql -U zendix -d postgres -c "CREATE DATABASE $databaseName"
        $createdNames += $databaseName
    }
    $sourceUrl = "postgresql://zendix:development_only@postgres:5432/$sourceName"
    $targetUrl = "postgresql://zendix:development_only@postgres:5432/$targetName"
    Invoke-DevelopmentDocker exec -T -e "DATABASE_URL=$sourceUrl" api npx prisma migrate deploy
    Invoke-DevelopmentDocker exec -T -e "DATABASE_URL=$sourceUrl" api node scripts/restore-fixture.mjs seed
    Invoke-DevelopmentDocker exec -T postgres pg_dump -U zendix -Fc -f "/tmp/zendix-restore-$tag.dump" $sourceName
    Invoke-DevelopmentDocker exec -T postgres pg_restore -U zendix --exit-on-error -d $targetName "/tmp/zendix-restore-$tag.dump"
    Invoke-DevelopmentDocker exec -T -e "DATABASE_URL=$targetUrl" api node scripts/restore-fixture.mjs verify
} finally {
    foreach ($databaseName in $createdNames) {
        if ($databaseName -match '^zendix_restore_(source|target)_[a-f0-9]{8}$') {
            & docker compose -p zendix -f compose.yaml exec -T postgres psql -U zendix -d postgres -c "DROP DATABASE $databaseName"
        }
    }
}
