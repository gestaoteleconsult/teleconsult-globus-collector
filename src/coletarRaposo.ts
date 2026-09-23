import "dotenv/config"
import axios from "axios"
import { startOfWeek, endOfWeek, subWeeks, addWeeks, format, parseISO } from 'date-fns'
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

  console.log("Enviando dados de carros para a API do Globus...")
  console.log(`Total de carros a serem enviados: ${data.length}`)

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

  console.log("Enviando dados de linhas para a API do Globus...")
  console.log(`Total de linhas a serem enviadas: ${data.length}`)

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
      TO_CHAR(f.dtnasctofunc, 'YYYY-MM-DD') as nascimento,
      f.SITUACAOFUNC as situacao
    from
      flp_funcionarios f
    where
      f.SITUACAOFUNC = 'A' or f.SITUACAOFUNC = 'F'
  `)

  console.log("Enviando dados de motoristas para a API do Globus...")
  console.log(`Total de motoristas a serem enviados: ${data.length}`)

  await axios.post("https://login.teleconsult.com.br/api/inbound/globus/motoristas", {
    id_empresa: process.env.ID_EMPRESA,
    token: process.env.TOKEN,
    data: data
  })
}

const syncViagensGlobus = async () => {
  const inicio = startOfWeek(subWeeks(new Date(), 2), { weekStartsOn: 1 })
  const fim = endOfWeek(addWeeks(new Date(), 0), { weekStartsOn: 1 })
  // const inicio = parseISO('2026-05-01T00:00:00')
  // const fim = parseISO('2026-07-22T23:59:59')
  // const fim = parseISO('2024-06-24T23:59:59')

  console.log(`Sincronizando dados de ${format(inicio, 'dd/MM/yyyy HH:mm:ss')} a ${format(fim, 'dd/MM/yyyy HH:mm:ss')}`)

  const db = DbOracle.getConnection()

  const data = await db.raw(`
      select
        to_char( t_arr_viagens_guia.QTD_HORA_INI , 'yyyy-mm-dd' ) dt,
        prefixoveic,
        l.codigolinha,
        l.nomelinha,
        l.codintlinha,
        codigoorgconc,
        '' cod_servdiaria,
        to_char( t_arr_viagens_guia.QTD_HORA_INI , 'yyyy-mm-dd hh24:mi:ss' ) dti,
        to_char( t_arr_viagens_guia.QTD_HORA_FINAL , 'yyyy-mm-dd hh24:mi:ss' ) dtf,
        frt_cadveiculos.CODIGOTPFROTA cdft,
        fm.codfunc f1cod,
        fm.apelidofunc f1ap,
        fm.nomefunc f1nome,
        to_char( t_arr_viagens_guia.QTD_HORA_INI , 'yyyy-mm-dd hh24:mi:ss' ) dtg,
        frt_cadveiculos.CODIGOEMPRESA,
        fm.codintfunc as CODIGO_FUNCIONARIO
      from
        t_arr_viagens_guia
        left join frt_cadveiculos
          on frt_cadveiculos.codigoveic = t_arr_viagens_guia.COD_VEICULO
        Join bgm_cadlinhas l
          on t_arr_viagens_guia.cod_intlinha = l.codintlinha
        left join T_ARR_TROCAS_FUNC
          on T_ARR_TROCAS_FUNC.COD_SEQ_GUIA = t_arr_viagens_guia.COD_SEQ_GUIA and FLG_MOT_COB = 'M'
        left Join flp_funcionarios fm
          on fm.codintfunc = T_ARR_TROCAS_FUNC.codintfunc
      where
        -- frt_cadveiculos.CODIGOEMPRESA = id_empresa and
        t_arr_viagens_guia.QTD_HORA_INI between to_date('${format(inicio, 'yyyy-MM-dd HH:mm:ss')}','yyyy-mm-dd hh24:mi:ss') and to_date('${format(fim, 'yyyy-MM-dd HH:mm:ss')}','yyyy-mm-dd hh24:mi:ss') 
  `)

  console.log("Enviando dados de viagens para a API do Globus...")
  console.log(`Total de viagens a serem enviadas: ${data.length}`)

  const CHUNK_SIZE = 200
  const totalChunks = Math.ceil(data.length / CHUNK_SIZE)

  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE)
    const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1

    console.log(`Enviando chunk ${chunkIndex}/${totalChunks} (${chunk.length} viagens)...`)

    await axios.post("https://login.teleconsult.com.br/api/inbound/globus/viagens", {
      id_empresa: process.env.ID_EMPRESA,
      token: process.env.TOKEN,
      data: chunk
    })

    console.log(`Chunk ${chunkIndex}/${totalChunks} enviado com sucesso.`)
  }

  console.log("Todas as viagens foram enviadas.")
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