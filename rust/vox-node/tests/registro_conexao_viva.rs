//! Registro de pares: um endereço com dono conectado não é tomado por outra conexão
//! (mesma regra do relay em Python, `relay/test_registro_conexao_viva.py`).

use std::net::{TcpListener, TcpStream};

use vox_node::json::JsonValue;
use vox_node::registry::{PeerRegistry, PeerSender};

/// Remetente real ligado a um socket local; nenhum quadro é lido nestes testes.
fn remetente() -> (PeerSender, TcpListener) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local");
    let stream = TcpStream::connect(listener.local_addr().expect("addr")).expect("connect local");
    (PeerSender::spawn(stream, 4), listener)
}

fn chave(nome: &str) -> JsonValue {
    JsonValue::Object(vec![("x".to_string(), JsonValue::String(nome.to_string()))])
}

fn registrar(
    registry: &PeerRegistry,
    peer: &str,
    conn_id: u64,
    address: &str,
    dm_pub: &str,
) -> Vec<String> {
    let (sender, _listener) = remetente();
    registry.register(
        peer.to_string(),
        conn_id,
        sender,
        address.to_string(),
        Some(chave(dm_pub)),
    )
}

fn entrada(registry: &PeerRegistry, address: &str) -> Option<(String, JsonValue)> {
    let JsonValue::Object(entradas) = registry.address_map_json("") else {
        return None;
    };
    let mut donos = entradas.iter().filter(|(nome, _)| nome == address);
    let (_, info) = donos.next()?;
    if donos.next().is_some() {
        return None; // dois pares respondendo pelo mesmo endereço
    }
    let dono = info.get("peerId")?.as_str()?.to_string();
    Some((dono, info.get("dmPub")?.clone()))
}

fn com_dono() -> PeerRegistry {
    let registry = PeerRegistry::new();
    registrar(&registry, "dono", 1, "vx_a", "dono");
    registry
}

#[test]
fn conexao_alheia_nao_toma_endereco_de_peer_conectado() {
    let registry = com_dono();
    registrar(&registry, "intruso", 2, "vx_a", "alheia");
    assert_eq!(
        entrada(&registry, "vx_a"),
        Some(("dono".to_string(), chave("dono")))
    );
}

#[test]
fn dono_que_registra_de_novo_continua_no_mapa() {
    let registry = com_dono();
    registrar(&registry, "intruso", 2, "vx_a", "alheia");
    registrar(&registry, "dono", 3, "vx_a", "dono");
    assert_eq!(
        entrada(&registry, "vx_a"),
        Some(("dono".to_string(), chave("dono")))
    );
}

#[test]
fn dono_se_registra_de_novo_com_chave_nova() {
    let registry = com_dono();
    registrar(&registry, "dono", 2, "vx_a", "nova");
    assert_eq!(
        entrada(&registry, "vx_a"),
        Some(("dono".to_string(), chave("nova")))
    );
}

#[test]
fn peer_alheio_ainda_entra_na_sala_e_nao_deixa_chave_solta() {
    let registry = com_dono();
    let outros = registrar(&registry, "intruso", 2, "vx_a", "alheia");
    assert_eq!(outros, vec!["dono".to_string()]);
    assert!(registry.get_sender("intruso").is_some());
    let mapa = registry.address_map_json("dono");
    assert_eq!(
        mapa,
        JsonValue::Object(Vec::new()),
        "o intruso não deixa endereço nem chave"
    );
}

#[test]
fn endereco_livre_pode_ser_registrado_por_outro_peer() {
    let registry = com_dono();
    registrar(&registry, "outra", 2, "vx_b", "alheia");
    assert_eq!(
        entrada(&registry, "vx_b"),
        Some(("outra".to_string(), chave("alheia")))
    );
}

#[test]
fn endereco_liberado_quando_o_dono_sai() {
    let registry = com_dono();
    assert!(registry.unregister("dono", 1));
    registrar(&registry, "novo", 2, "vx_a", "alheia");
    assert_eq!(
        entrada(&registry, "vx_a"),
        Some(("novo".to_string(), chave("alheia")))
    );
}
