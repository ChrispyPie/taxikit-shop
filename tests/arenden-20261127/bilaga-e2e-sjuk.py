import json,urllib.request,base64,sys
U='https://lpfdryvukqmjlgenuzpb.supabase.co'; K='sb_publishable_7LwIOZ5ygRvJqJKFxl4cNQ_LvrzrHrP'
D='bilagae2edrivertokentokentokentoken0123456789'; O='bilagae2eownertokentokentokentoken0123456789'
def call(fn,body):
    body=dict(body); 
    req=urllib.request.Request(U+'/functions/v1/'+fn,json.dumps(body).encode(),{'apikey':K,'Content-Type':'application/json'})
    try:
        r=urllib.request.urlopen(req); return r.status,json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code,json.loads(e.read() or b'{}')
jpg=base64.b64encode(bytes([0xff,0xd8,0xff,0xe0])+bytes(400)).decode()
step=sys.argv[1]
if step=='up':
    print(call('sjuk',{'action':'upload','token':D,'report_id':11,'file':jpg,'mime':'image/jpeg'}))
    print(call('sjuk',{'action':'upload','token':D,'report_id':11,'file':jpg,'mime':'image/jpeg'}))
elif step=='list':
    print(json.dumps(call('sjuk',{'action':'list','token':sys.argv[2],'report_id':11}))[:900])
elif step=='del':
    print(call('sjuk',{'action':'delete_cert','token':sys.argv[2],'cert_id':int(sys.argv[3])}))
