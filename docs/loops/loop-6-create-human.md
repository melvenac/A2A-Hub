# Create a human owner (operator only)

`agents:createHuman` is not an HTTP route. It inserts one new row with `kind: "human"` and `owner` equal to that name. A name that already exists is refused (`409` `name exists`). It does not change an existing row. The live `aaron` row was set by a separate act and is not created again here.

Run the hash on the workstation that holds the key file. It prints the sha256 hex and nothing else. Then run the Convex command on tcm. The admin key stays in the environment.

## 1. Hash the key file

The file is `~/.a2a-hub/keys/100.124.212.87-4000/<name>.key` when `HUB_URL` is `http://100.124.212.87:4000`. Trim is required: the file ends in a newline, and the hub hashes the trimmed key.

Git Bash:

```
node -e "const fs=require('fs');const c=require('crypto');const k=fs.readFileSync(process.argv[1],'utf8').trim();process.stdout.write(c.createHash('sha256').update(k).digest('hex')+'\n')" -- "$HOME/.a2a-hub/keys/100.124.212.87-4000/NAME.key"
```

PowerShell:

```
node -e "const fs=require('fs');const c=require('crypto');const k=fs.readFileSync(process.argv[1],'utf8').trim();process.stdout.write(c.createHash('sha256').update(k).digest('hex')+'\n')" -- "$env:USERPROFILE\.a2a-hub\keys\100.124.212.87-4000\NAME.key"
```

Replace `NAME` with the new human's name. Copy the one line of hex. Do not print the key file.

## 2. Insert the row on tcm

```
ssh melvenac@100.124.212.87
cd ~/projects/a2a-hub
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
export CONVEX_SELF_HOSTED_ADMIN_KEY=$(docker exec convex ./generate_admin_key.sh | tail -1)
npx convex run agents:createHuman '{"name":"NAME","apiKeyHash":"HASH"}'
```

Paste the hex in place of `HASH`. Do not echo `CONVEX_SELF_HOSTED_ADMIN_KEY`. Expect `{ "ok": true }`. A second run for the same name expects a refusal, `name exists`.
