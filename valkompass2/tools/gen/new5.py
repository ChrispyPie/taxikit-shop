import json
B="https://www.riksdagen.se/sv/dokument-och-lagar/dokument/betankande/"
U29=B+"tydligare-krav-pa-fristaende-forskolor-skolor-och_h901ubu29/omrostning/firande-av-skolavslutningar-och-traditionella~69070bc4-3f9f-418e-8f91-ea7968d923a3/"
U7=B+"_hd01ubu7/omrostning/skolor-med-konfessionell-inriktning~98bb1ebe-3dab-4acb-b6f3-7c535d018cd0/"
DCA=B+"_hb01uf%C3%B6u1/"
KU25=B+"fri-och-rattigheter_hc01ku25/omrostning/forbud-mot-rasistiska-organisationer~565acbb2-d8c5-49d3-a768-a2c26bfa9e3b/"
KS="https://kristnaskolor.se/"
SVT23="https://www.svt.se/nyheter/inrikes/sa-staller-sig-de-politiska-partierna-till-koranbranningarna"
SVT25="https://www.svt.se/nyheter/inrikes/forbudet-mot-koranbranningar-lagt-i-byraladan"
OMNI="https://omni.se/s-vill-inte-langre-forbjuda-koranbranningar/a/PpXPJe"
S_RS="https://www.socialdemokraterna.se/var-politik/a-till-o/religiosa-skolor"
V_RF="https://www.vansterpartiet.se/var-politik/politik-a-o/religiosa-friskolor/"
V_KU="https://www.vansterpartiet.se/var-politik/politik-a-o/kultur/"
V_RO="https://www.vansterpartiet.se/var-politik/politik-a-o/rasistiska-organisationer/"
L_FS="https://www.liberalerna.se/politik/friskolor"
L_EX="https://www.liberalerna.se/politik/extremism"
L_SK="https://www.liberalerna.se/politik/skola"
SD_MF="https://www.sd.se/a-till-o/muslimska-friskolor/"
SD_YF="https://www.sd.se/a-till-o/yttrandefrihet/"
SD_HF="https://www.sd.se/a-till-o/hets-mot-folkgrupp/"
MP_DM="https://www.mp.se/politik/demokrati-och-mr/"
KD_M="https://www.riksdagen.se/sv/dokument-och-lagar/dokument/motion/kristna-friskolor_he02174/"
out=[]
def E(p,sid,val,conf,url,quote,st,detail,date,note=""):
    out.append(dict(party=p,statementId=sid,value=val,sourceType=st,sourceDetail=detail,url=url,quote=quote,date=date,confidence=conf,note=note))
def VOTE(p,sid,val,conf,url,quote,detail,date,note=""): E(p,sid,val,conf,url,quote,"riksdagsvotering",detail,date,note)
def SITE(p,sid,val,conf,url,quote,note=""): E(p,sid,val,conf,url,quote,"officiellt uttalande","Partiets politiksida",None,note)
def ENK(p,sid,val,conf,quote,note=""): E(p,sid,val,conf,KS,quote,"enkätsvar","Partiets svar i Kristna Friskolerådets valenkät om konfessionella skolor (inför valet 2022)","2022",note)
def MEDIA(p,sid,val,conf,url,quote,detail,date,note=""): E(p,sid,val,conf,url,quote,"medieuppgift",detail,date,note)

# s-31 Skolavslutningar i kyrkan ska få ha bön och psalmer. (pos)
R5="Utskottets förslag mot reservation 5 (SD, KD)"
D5="2021/22:UbU29 punkt 5 Firande av skolavslutningar och traditionella högtider, juni 2022. Reservation 5 (SD, KD) ville att prästen ska kunna be en bön och eleverna sjunga en psalm vid skolavslutning i kyrkan"
for p,val,conf,how,note in [
 ("s",-2,"hög","S röstade Ja (88) till regeringens linje: inga konfessionella inslag.","S-regeringen lade själv förslaget. S vill också att 'Religiös påverkan hör inte hemma i det offentligt finansierade utbildningssystemet' (sidan Religiösa skolor)."),
 ("m",-1,"medel","M röstade Ja (60, 1 Nej) till utskottets förslag.","M röstade mot bön och psalm 2022, men enskilda M-ledamöter har motionerat om att värna skolavslutningar (2025/26:1189). Därför -1."),
 ("sd",2,"hög","SD röstade Nej (54) och stod bakom reservation 5.",""),
 ("c",-1,"medel","C röstade Ja (28) till utskottets förslag.","C säger samtidigt att undervisning aldrig får ha konfessionella inslag (Kristna Friskolerådets enkät). Ingen egen C-källa om skolavslutningar. Därför -1."),
 ("kd",2,"hög","KD röstade Nej (16) och stod bakom reservation 5.","KD-ledamöter har lagt nya motioner om samma sak hösten 2026 (2026/27:127, 134, 170, 185)."),
 ("l",-2,"hög","L röstade Ja (16) till utskottets förslag.","L vill att skolan ska vara 'fri från religiös påverkan' (sidan Skola)."),
 ("mp",-2,"hög","MP röstade Ja (10) till utskottets förslag.","MP: 'all undervisning ska vara helt fri från religiös påverkan' (Kristna Friskolerådets enkät)."),
]:
    VOTE(p,"s-31",val,conf,U29,R5,f"{D5}. {how}","2022-06-15",note)
ENK("v","s-31",-2,"medel","Religiös eller annan ideologisk påverkan ska inte förekomma i skolan oavsett om det handlar om obligatoriska eller frivilliga inslag i utbildningen.","V avstod (21) i omröstningen om reservation 5 i 2021/22:UbU29, men vill enligt enkäten inte ha några religiösa inslag alls i skolan.")

# s-32 Skolor med religiös inriktning ska förbjudas. (neg)
SITE("s","s-32",2,"hög",S_RS,"Därför vill vi förbjuda religiösa friskolor samtidigt som vi värnar och tar hänsyn till nationella minoriteters rättigheter.","S stod också bakom reservation 33 i 2025/26:UbU7 och avstod i omröstningen om SD:s förslag (som bara gällde muslimska skolor).")
SITE("v","s-32",2,"hög",V_RF,"Därför vill vi förbjuda religiösa friskolor.")
SITE("l","s-32",2,"hög",L_FS,"Liberalerna har som första borgerliga parti tagit ställning för ett förbud mot religiösa friskolor.","Undantag för nationella minoriteter.")
SITE("sd","s-32",1,"medel",SD_MF,"Muslimska friskolor som är konfessionella utan att ange det ska stängas omgående.","SD vill förbjuda muslimska friskolor (reservation 34 i 2025/26:UbU7, där SD röstade Nej), men inte kristna eller judiska. Därför +1.")
ENK("m","s-32",0,"låg","Moderaterna vill se ett tillfälligt etableringsstopp för konfessionella friskolor.","Vill stoppa nya skolor tills vidare, inte förbjuda dem. M röstade Ja (mot SD:s förbud) i 2025/26:UbU7 p15. Källan är från 2022. Därför 0.")
ENK("c","s-32",-1,"medel","Centerpartiet är för det fria skolvalet och är för att det finns fristående skolor.","Vill ha bättre tillsyn i stället för förbud. C röstade Ja (mot SD:s förbud) i 2025/26:UbU7 p15. Därför -1.")
E("kd","s-32",-2,"hög",KD_M,"Huvudmän som driver trygga och välfungerande skolor måste däremot få fortsätta sin verksamhet under goda förutsättningar.","partimotion","Motion 2026/27 'Kristna friskolor' av KD-ledamöter","2026-10","Vill stänga skolor som missköts men inte förbjuda religiösa skolor. KD röstade Ja (mot SD:s förbud) i 2025/26:UbU7 p15.")
ENK("mp","s-32",-1,"medel","Däremot är vi tveksamma till om ett etableringsstopp för dessa skolor är förenligt med våra åtaganden enligt internationella konventioner.","MP vill att undervisningen ska vara fri från religion, men är tveksamt till stopp och förbud. MP röstade Ja (mot SD:s förbud) i 2025/26:UbU7 p15. Därför -1.")

# s-33 USA ska få använda militära baser i Sverige, som försvarsavtalet tillåter. (pos)
DQ="Riksdagen a) godkänner avtalet om försvarssamarbete mellan Konungariket Sveriges regering och Amerikas förenta staters regering"
DD="2023/24:UFöU1 punkt 1 Avtal om försvarssamarbete med USA (DCA), juni 2024. Reservation 1 (V, MP) ville avslå avtalet"
for p in ["s","m","sd","c","kd","l"]:
    VOTE(p,"s-33",2,"hög",DCA,DQ,f"{DD}. Partiet stod bakom utskottets förslag att godkänna avtalet.","2024-06-18")
for p in ["v","mp"]:
    VOTE(p,"s-33",-2,"hög",DCA,DQ,f"{DD}. Partiet stod bakom reservation 1 mot avtalet.","2024-06-18")

# s-34 (Y1) Man ska få säga och skriva saker som andra upplever som kränkande, även om det gäller religion. (neg)
SQ="När SVT ställer frågan till riksdagens partier om det i alla lägen ska vara tillåtet att bränna heliga skrifter, svarar samtliga att Sverige ska fortsätta värna om yttrandefriheten."
SD23="SVT Nyheter frågade alla riksdagspartier om koranbränningar"
SITE("l","s-34",2,"hög",L_EX,"I ett öppet samhälle måste människor få uttrycka även avskyvärda åsikter, så länge de håller sig inom lagens ramar.")
SITE("sd","s-34",2,"medel",SD_YF,"Yttrandefriheten är en grundpelare i den svenska demokratin och ska värnas starkt.","SD säger också nej till förbud mot koranbränningar (SVT 2025).")
SITE("v","s-34",1,"medel",V_KU,"Vänsterpartiet är konsekventa försvarare av konstnärlig frihet och yttrandefrihet.","Säger inget uttryckligt om religion. Därför +1.")
SITE("mp","s-34",1,"medel",MP_DM,"Gränsen går vid brottsliga handlingar, till exempel hets mot folkgrupp.","Försvarar yttrandefriheten fram till det som redan är olagligt. Därför +1.")
MEDIA("s","s-34",1,"medel",OMNI,"Så vi har en ordning där det är tillåtet att elda koraner, men inte i syfte att hetsa mot muslimer, säger hon.","Omni/SVT Agenda: S rättspolitiska talesperson Teresa Carvalho","2025-02-02","S tycker att koranbränning är 'högst olämpligt' men vill inte längre ändra lagen. Därför +1.")
for p in ["m","c","kd"]:
    MEDIA(p,"s-34",1,"låg",SVT23,SQ,SD23,"2023-07-06","Gemensamt svar för alla partier, inte partiets egen text. Därför +1 och låg säkerhet.")

# s-35 (Y3) Staten ska kunna stoppa åsikter som sprider hat, även om de inte är olagliga i dag. (pos)
K9="Utskottets förslag mot reservation 9 (S)"
KD9="2024/25:KU25 punkt 11 Förbud mot rasistiska organisationer, 2025. Reservation 9 (S) ville utreda ett förbud mot rasistiska organisationer"
VOTE("s","s-35",0,"låg",KU25,K9,f"{KD9}. S röstade Nej (93) och stod bakom reservation 9.","2025-04-09","S vill kunna förbjuda rasistiska organisationer, vilket ligger nära påståendet, men inget om att stoppa lagliga åsikter. Därför 0.")
for p,n in [("m",60),("c",19),("kd",15)]:
    VOTE(p,"s-35",-1,"låg",KU25,K9,f"{KD9}. Partiet röstade Ja ({n}) och sa nej till utredningen.","2025-04-09","Ingen egen källa om att stoppa lagliga åsikter. Röstade mot att utreda förbud mot rasistiska organisationer. Därför -1.")
SITE("v","s-35",-2,"medel",V_RO,"Det tycker vi är en bättre väg än att försöka förbjuda rasistiska organisationer.","V röstade också Ja (mot utredning om förbud) i 2024/25:KU25 p11.")
SITE("l","s-35",-2,"hög",L_EX,"Därför är Liberalerna mycket skeptiska till förslag som begränsar yttrandefriheten.")
SITE("mp","s-35",-2,"medel",MP_DM,"Gränsen går vid brottsliga handlingar, till exempel hets mot folkgrupp.")
SITE("sd","s-35",-2,"medel",SD_HF,"Lagstiftningen om hets mot folkgrupp ska skydda människor mot hot och uppmaningar till våld, men samtidigt värna den grundlagsskyddade yttrandefriheten.")

# s-36 (Y2, Djupdyk) Det ska vara tillåtet att bränna religiösa böcker som en politisk protest. (neg)
MEDIA("sd","s-36",2,"medel",SVT25,"En minst lika viktig förklaring är att SD fortsatt säger nej till att förbjuda koranbränningar, med hänvisning till yttrandefriheten.","SVT Nyheter, analys om förbud mot koranbränningar","2025")
MEDIA("s","s-36",1,"medel",OMNI,"Så vi har en ordning där det är tillåtet att elda koraner, men inte i syfte att hetsa mot muslimer, säger hon.","Omni/SVT Agenda: S rättspolitiska talesperson Teresa Carvalho","2025-02-02","S tycker att det är 'högst olämpligt' men vill inte ändra lagen. Därför +1.")
for p in ["m","c","v","kd","l","mp"]:
    MEDIA(p,"s-36",1,"låg",SVT23,SQ,SD23,"2023-07-06","Gemensamt svar för alla partier: inget parti ville ändra lagen 2023. Därför +1 och låg säkerhet.")
for e in out: e["reviewedByParty"]=False
json.dump(out,open("/tmp/gen/new5.json","w"),ensure_ascii=False,indent=1)
import collections; print(len(out), collections.Counter(e["statementId"] for e in out))
