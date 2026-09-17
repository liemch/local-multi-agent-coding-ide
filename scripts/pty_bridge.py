#!/usr/bin/env python3
"""
Real PTY bridge used when the native `node-pty` addon is unavailable.

This allocates a genuine kernel PTY via the stdlib `pty` module, so interactive
shells, ANSI colours, job control and window resizing all behave exactly as in a
normal terminal. It is NOT a terminal emulation/fake — see plan coding rule #4.

Protocol (on stdin, from the Node parent):
    I<len>\\n<payload bytes>   -> write payload to the PTY
    R<cols>,<rows>\\n          -> resize the PTY window

Everything the child writes to the PTY is streamed verbatim to stdout.

Usage: pty_bridge.py <cols> <rows> <command> [args...]
"""

import errno
import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios


def set_winsize(fd: int, cols: int, rows: int) -> None:
    try:
        packed = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, packed)
    except OSError:
        pass


def read_exactly(stream, count: int) -> bytes:
    chunks = []
    remaining = count
    while remaining > 0:
        chunk = stream.read(remaining)
        if not chunk:
            break
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def main() -> int:
    if len(sys.argv) < 4:
        sys.stderr.write("usage: pty_bridge.py <cols> <rows> <command> [args...]\n")
        return 2

    cols = int(sys.argv[1])
    rows = int(sys.argv[2])
    argv = sys.argv[3:]

    pid, master_fd = pty.fork()

    if pid == 0:
        # Child: become the requested program with a controlling terminal.
        env = os.environ.copy()
        env.setdefault("TERM", "xterm-256color")
        env["COLUMNS"] = str(cols)
        env["LINES"] = str(rows)
        try:
            os.execvpe(argv[0], argv, env)
        except OSError as exc:
            sys.stderr.write(f"{argv[0]}: {exc.strerror}\n")
            sys.stderr.flush()
            os._exit(127)

    # Parent: pump data between stdin/stdout and the PTY master.
    set_winsize(master_fd, cols, rows)
    signal.signal(signal.SIGINT, signal.SIG_IGN)

    stdin_fd = sys.stdin.fileno()
    stdin_buffer = sys.stdin.buffer
    stdout_buffer = sys.stdout.buffer
    control = b""
    running = True
    exit_status = 0

    while running:
        try:
            readable, _, _ = select.select([master_fd, stdin_fd], [], [], 0.2)
        except (OSError, select.error) as exc:
            if getattr(exc, "errno", None) == errno.EINTR:
                continue
            break

        if master_fd in readable:
            try:
                data = os.read(master_fd, 65536)
            except OSError:
                data = b""
            if not data:
                running = False
            else:
                stdout_buffer.write(data)
                stdout_buffer.flush()

        if stdin_fd in readable:
            try:
                chunk = os.read(stdin_fd, 65536)
            except OSError:
                chunk = b""
            if not chunk:
                running = False
            else:
                control += chunk

        # Parse as many complete control frames as available.
        while True:
            newline = control.find(b"\n")
            if newline == -1:
                break
            header = control[:newline]
            rest = control[newline + 1 :]

            if header.startswith(b"I"):
                try:
                    length = int(header[1:])
                except ValueError:
                    control = rest
                    continue
                if len(rest) < length:
                    break  # wait for the rest of the payload
                payload = rest[:length]
                control = rest[length:]
                try:
                    os.write(master_fd, payload)
                except OSError:
                    running = False
            elif header.startswith(b"R"):
                control = rest
                try:
                    new_cols, new_rows = header[1:].split(b",")
                    set_winsize(master_fd, int(new_cols), int(new_rows))
                except (ValueError, OSError):
                    pass
            else:
                control = rest

    try:
        os.close(master_fd)
    except OSError:
        pass

    try:
        _, status = os.waitpid(pid, 0)
        exit_status = os.waitstatus_to_exitcode(status)
    except (ChildProcessError, OSError):
        exit_status = 0

    return exit_status if exit_status >= 0 else 1


if __name__ == "__main__":
    sys.exit(main())
