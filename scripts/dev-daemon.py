#!/usr/bin/env python3
"""Persistent dev-server launcher for PAPER STORM (double-fork daemon)."""
import os, sys, time

if os.fork() > 0:
    sys.exit(0)
os.setsid()
if os.fork() > 0:
    sys.exit(0)
os.chdir("/home/z/my-project")
with open("/home/z/my-project/dev.log", "ab", 0) as logf:
    os.dup2(logf.fileno(), 1)
    os.dup2(logf.fileno(), 2)
    os.close(0)
    os.execvp("bun", ["bun", "run", "dev"])
