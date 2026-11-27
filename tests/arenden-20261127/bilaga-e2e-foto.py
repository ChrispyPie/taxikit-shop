import json,urllib.request,base64
U='https://lpfdryvukqmjlgenuzpb.supabase.co'; K='sb_publishable_7LwIOZ5ygRvJqJKFxl4cNQ_LvrzrHrP'
D='bilagae2edrivertokentokentokentoken0123456789'; O='bilagae2eownertokentokentokentoken0123456789'
def call(body):
    req=urllib.request.Request(U+'/functions/v1/bil-foto',json.dumps(body).encode(),{'apikey':K,'Content-Type':'application/json'})
    try: r=urllib.request.urlopen(req); return r.status,json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code,json.loads(e.read() or b'{}')
jpg=base64.b64encode(bytes([0xff,0xd8,0xff,0xe0])+bytes(400)).decode()
a=call({'action':'upload','token':D,'issue_id':24,'image':jpg})[1]['id']
b=call({'action':'upload','token':D,'issue_id':24,'image':jpg})[1]['id']
c=call({'action':'upload','token':O,'issue_id':24,'image':jpg})[1]['id']
print('uploaded',a,b,c)
print('driver deletes other (owner) photo ->',call({'action':'delete_photo','token':D,'photo_id':c}))
print('driver deletes own ->',call({'action':'delete_photo','token':D,'photo_id':a}))
print('owner deletes drivers ->',call({'action':'delete_photo','token':O,'photo_id':b}))
r=call({'action':'list','token':D,'issue_id':24}); print(json.dumps(r)[:700])
