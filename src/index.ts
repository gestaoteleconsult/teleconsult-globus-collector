import "dotenv/config"
import axios from "axios"
import { startOfWeek, endOfWeek, subWeeks, addWeeks, format } from 'date-fns'
import { CronJob } from 'cron';

import DbOracle from "./database/connectionManager.js"

const syncCarrosGlobus = async () => {
  const db = DbOracle.getConnection()

  const data = await db.raw(`
    select
      codigoveic,
      CODIGOTPFROTA,
      placaatualveic,
      prefixoveic,
      condicaoveic,
      CODIGOEMPRESA
    from
      FRT_CADVEICULOS
    order by
      PREFIXOVEIC
  `)

  await axios.post("https://login.teleconsult.com.br/api/inbound/globus/carros", {
    id_empresa: process.env.ID_EMPRESA,
    token: process.env.TOKEN,
    data: data
  })
}

const syncLinhasGlobus = async () => {
  const db = DbOracle.getConnection()

  const data = await db.raw(`
    select
      CODINTLINHA,
      CODIGOORGCONC,
      CODIGOLINHA,
      NROFICIALLINHA,
      NOMELINHA,
      CODIGOEMPRESA
    from
      bgm_cadlinhas
    where
      CODIGOORGCONC is not null
  `)

  await axios.post("https://login.teleconsult.com.br/api/inbound/globus/linhas", {
    id_empresa: process.env.ID_EMPRESA,
    token: process.env.TOKEN,
    data: data
  })
}

const syncMotoristasGlobus = async () => {
  const db = DbOracle.getConnection()

  const data = await db.raw(`
    select
      f.codintfunc,
      f.chapafunc,
      f.nomefunc,
      f.codfunc,
      f.apelidofunc,
      f.codigoempresa,
      f.fonefunc as fone,
      TO_CHAR(f.dtnasctofunc, 'YYYY-MM-DD') as nascimento
    from
      flp_funcionarios f
    where
      f.SITUACAOFUNC = 'A' or f.SITUACAOFUNC = 'F'
  `)

  await axios.post("https://login.teleconsult.com.br/api/inbound/globus/motoristas", {
    id_empresa: process.env.ID_EMPRESA,
    token: process.env.TOKEN,
    data: data
  })
}

const syncViagensGlobus = async () => {
  const inicio = startOfWeek(subWeeks(new Date(), 2), { weekStartsOn: 1 })
  const fim = endOfWeek(addWeeks(new Date(), 0), { weekStartsOn: 1 })

  console.log(`Sincronizando dados de ${format(inicio, 'dd/MM/yyyy HH:mm:ss')} a ${format(fim, 'dd/MM/yyyy HH:mm:ss')}`)

  const db = DbOracle.getConnection()

  const data = await db.raw(`
      select
        to_char(sr.dtsaida, 'yy-mm-dd' ) dt,
        cv.prefixoveic,
        l.codigolinha,
        l.nomelinha,
        l.codintlinha,
        fm.codfunc f1cod,
        fm.apelidofunc f1ap,
        fm.nomefunc f1nome,
        to_char(sr.horasaidagaragem, 'yyyy-mm-dd hh24:mi:ss' ) dti,
        to_char(sr.horarecolhida, 'yyyy-mm-dd hh24:mi:ss' ) dtf,
        cv.CODIGOTPFROTA cdft,
        fm.CODINTFUNC as CODIGO_FUNCIONARIO,
        codigoorgconc
      from
        plt_saidarecolhida sr
      join frt_cadveiculos cv
        on sr.codigoveic = cv.codigoveic
      left Join flp_funcionarios fm
        on sr.codintmot = fm.codintfunc
      left Join flp_funcionarios fc
        on sr.codintcob = fc.codintfunc
      Join bgm_cadlinhas l
        on sr.codintlinha = l.codintlinha		 
      where
        sr.horasaidagaragem between to_date('${format(inicio, 'yyyy-MM-dd HH:mm:ss')}','yyyy-mm-dd hh24:mi:ss') and to_date('${format(fim, 'yyyy-MM-dd HH:mm:ss')}','yyyy-mm-dd hh24:mi:ss') 
      order by
        cdft,
        cv.prefixoveic,
        sr.horasaidagaragem
  `)

  const CHUNK_SIZE = 200
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE)
    console.log(`Enviando chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(data.length / CHUNK_SIZE)} (${chunk.length} viagens)...`)

    await axios.post("https://login.teleconsult.com.br/api/inbound/globus/viagens", {
      id_empresa: process.env.ID_EMPRESA,
      token: process.env.TOKEN,
      data: chunk
    })
  }
}

const executar = async () => {
  try {
    await syncCarrosGlobus()
    await syncLinhasGlobus()
    await syncMotoristasGlobus()
    await syncViagensGlobus()
  } catch (error) {
    console.error("Erro ao sincronizar dados com a API do Globus:", error)
  }
}

executar()

const job = new CronJob(
  '0 0 3 * * *', // cronTime
  function () {
    executar()
  }, // onTick
  null, // onComplete
  true, // start
  'America/Sao_Paulo' // timeZone
);