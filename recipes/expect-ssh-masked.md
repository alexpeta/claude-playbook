# Recipe — SSH with a password from `.env`, never printed

Credentials live in the project's gitignored `.env` (`SSH_IP`, `SSH_USER`, `SSH_PWD`);
`set -a; source .env; set +a` in the calling shell, then:

```tcl
set timeout 240
set user $env(SSH_USER); set host $env(SSH_IP); set pw $env(SSH_PWD)
log_user 0
spawn ssh -tt -o StrictHostKeyChecking=no $user@$host "<commands>; echo '== END'; exit"
expect {
  -re "(?i)assword" { sleep 1; send "$pw\r"; exp_continue }
  "== END" { }
  timeout { puts "TIMEOUT" }
  eof { }
}
puts [string map [list $pw "***"] $expect_out(buffer)]
catch { expect eof }
```

- The 1 s pause before sending the password matters: sending before the tty drops echo
  garbles it AND echoes a fragment.
- Mask with `string map`, never `grep -v password` (it let a fragment through once).
- **`expect_out(buffer)` holds only the last ~2000 bytes** (`match_max` default), so printing it
  after a long remote command silently drops the head of the output — two NAS rounds came back
  as their last six lines before anyone noticed (2026-09-07). Capture the whole session with
  `log_file -a <path>` (the `-a` records what `log_user 0` suppresses), then mask the file with
  `sed "s/$SSH_PWD/***/g"` before reading it; or raise `match_max -d` before `spawn`.
- `sudo` on a NAS asks for the user's own password and its secure_path lacks docker; put
  docker on the PATH explicitly (`sudo env PATH=… docker …`).
- Square brackets inside the spawn string are Tcl command substitution — `grep '[d]ocker'`
  breaks the script; use `grep … | grep -v grep`.
- Anything longer than the timeout runs detached on the far side (`nohup sh -c '…; echo DONE >> log' &`)
  and is polled; an expect timeout kills the session, not the remote daemon's work.
