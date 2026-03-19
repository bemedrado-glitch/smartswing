# SmartSwing Test Suite

Run from `_smartswing_web`:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\run-tests.ps1
```

This suite validates:
- page and asset HTTP reachability
- key integration markers on core pages
- internal HTML link integrity
- analyzer report pipeline markers
- headless browser rendering of a demo AI report (`analyze.html?demo=1`)
