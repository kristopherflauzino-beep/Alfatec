import React, { useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import REPORT_LOGO_BASE64 from "./report_logo_base64_module";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const STORAGE_KEY = "@chamada_professor_state_v1";
const NOTE_FIELDS = [
  { key: "note1", label: "Nota 1" },
  { key: "note2", label: "Nota 2" },
  { key: "note3", label: "Nota 3" },
  { key: "note4", label: "Nota 4" },
];
const SCREEN_TABS = [
  { key: "classes", label: "Turmas" },
  { key: "report", label: "Relatorio" },
  { key: "data", label: "Dados" },
];
const APP_LOGO = require("./assets/alfatec-logo.png");
const PDF_REPORT_PAGE = {
  width: 595,
  height: 842,
  margin: 28,
};
const PDF_REPORT_LOGO_SIZE = {
  width: 900,
  height: 685,
};

export default function App({ sessionContext = null, cloudSync = null } = {}) {
  const [appData, setAppData] = useState(createInitialData());
  const [currentScreen, setCurrentScreen] = useState("classes");
  const [studentForm, setStudentForm] = useState(createEmptyStudentForm());
  const [editStudentForm, setEditStudentForm] = useState(createEmptyEditStudentForm());
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [classNameDraft, setClassNameDraft] = useState("Turma 1");
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState({
    label: "Carregando dados do aparelho...",
    lastSavedAt: null,
  });
  const [reportClassId, setReportClassId] = useState("class-1");
  const [reportStatus, setReportStatus] = useState("Escolha uma turma para gerar o relatorio em PDF no Android.");
  const [now, setNow] = useState(Date.now());
  const scrollViewRef = useRef(null);
  const editCardOffsetRef = useRef(0);

  const selectedClass =
    appData.classes.find((classItem) => classItem.id === appData.selectedClassId) || appData.classes[0];
  const selectedClassStudents = sortStudentsByName(selectedClass.students);
  const selectedReportClass =
    appData.classes.find((classItem) => classItem.id === reportClassId) || selectedClass;
  const isEditingStudent = Boolean(editingStudentId);

  useEffect(() => {
    let isMounted = true;

    async function hydrateApp() {
      try {
        const savedValue = await AsyncStorage.getItem(STORAGE_KEY);

        if (!savedValue) {
          if (!isMounted) {
            return;
          }

          setAppData(createInitialData());
          setSaveStatus({
            label: "Sem dados anteriores. O app esta pronto para uso.",
            lastSavedAt: null,
          });
          setIsReady(true);
          setIsLoading(false);
          return;
        }

        const parsedValue = JSON.parse(savedValue);

        if (!isMounted) {
          return;
        }

        setAppData(normalizeAppData(parsedValue));
        setSaveStatus({
          label: "Dados carregados com sucesso do aparelho.",
          lastSavedAt: Date.now(),
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setAppData(createInitialData());
        setSaveStatus({
          label: "Nao foi possivel ler o arquivo salvo. O app iniciou com dados novos.",
          lastSavedAt: null,
        });
      } finally {
        if (isMounted) {
          setIsReady(true);
          setIsLoading(false);
        }
      }
    }

    hydrateApp();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedClass) {
      return;
    }

    setClassNameDraft(selectedClass.name);
  }, [selectedClass]);

  useEffect(() => {
    if (!appData.classes.length) {
      return;
    }

    setReportClassId((current) =>
      appData.classes.some((classItem) => classItem.id === current) ? current : appData.selectedClassId
    );
  }, [appData.classes, appData.selectedClassId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 60000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!editingStudentId) {
      return;
    }

    const editingStillExists = selectedClass.students.some((student) => student.id === editingStudentId);
    if (!editingStillExists) {
      clearEditStudentForm();
    }
  }, [editingStudentId, selectedClass]);

  useEffect(() => {
    if (!editingStudentId) {
      return;
    }

    const currentEditingStudent = selectedClass.students.find((student) => student.id === editingStudentId);
    if (!currentEditingStudent) {
      return;
    }

    setEditStudentForm((current) => ({
      ...current,
      presences: String(currentEditingStudent.presences),
      absences: String(currentEditingStudent.absences),
    }));
  }, [editingStudentId, selectedClass.students]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    let isMounted = true;

    async function persistData() {
      setSaveStatus((current) => ({
        ...current,
        label: "Salvando alteracoes no aparelho...",
      }));

      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
        if (cloudSync) {
          try {
            const summary = calculateGlobalSummary(appData.classes);
            await cloudSync({
              studentCount: summary.studentCount,
              classCount: appData.classes.length,
              deviceLabel:
                sessionContext?.displayName ||
                sessionContext?.email ||
                "mobile",
              lastSavedAt: Date.now(),
            });
          } catch (_error) {
            // O salvamento local continua sendo a fonte principal do aparelho.
          }
        }

        if (!isMounted) {
          return;
        }

        setSaveStatus({
          label: "Tudo salvo automaticamente no aparelho.",
          lastSavedAt: Date.now(),
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setSaveStatus((current) => ({
          label: "Nao foi possivel salvar agora. Tente novamente.",
          lastSavedAt: current.lastSavedAt,
        }));
      }
    }

    persistData();

    return () => {
      isMounted = false;
    };
  }, [appData, cloudSync, isReady, sessionContext]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#C45D2E" />
        <Text style={styles.loadingTitle}>Preparando o app de chamada</Text>
        <Text style={styles.loadingText}>Carregando turmas, alunos e relatorios salvos no aparelho.</Text>
      </SafeAreaView>
    );
  }

  const selectedClassSummary = calculateClassSummary(selectedClassStudents);
  const globalSummary = calculateGlobalSummary(appData.classes);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroHeaderRow}>
              <View style={styles.heroTextColumn}>
                <Text style={styles.eyebrow}>App de Chamada</Text>
                <Text style={styles.heroTitle}>Controle turmas, frequencia, notas e observacoes em um so lugar.</Text>
                <Text style={styles.heroText}>{formatLiveDate(now)}</Text>
                <Text style={styles.heroMeta}>
                  {saveStatus.label}
                  {saveStatus.lastSavedAt ? `  Ultimo salvamento: ${formatDateTime(saveStatus.lastSavedAt)}` : ""}
                </Text>
              </View>

              <View style={styles.heroLogoShell}>
                <Image source={APP_LOGO} style={styles.heroLogo} resizeMode="contain" />
              </View>
            </View>
          </View>

          <View style={styles.tabRow}>
            {SCREEN_TABS.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                activeOpacity={0.86}
                onPress={() => setCurrentScreen(tab.key)}
                style={[styles.tabButton, currentScreen === tab.key && styles.tabButtonActive]}
              >
                <Text style={[styles.tabButtonText, currentScreen === tab.key && styles.tabButtonTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {currentScreen === "classes" ? (
            <>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>Selecao de turmas</Text>
                <Text style={styles.sectionTitle}>Escolha ou crie novas turmas</Text>
                <Text style={styles.sectionText}>
                  O professor pode renomear as turmas, adicionar quantas precisar e cada alteracao fica salva automaticamente.
                </Text>

                <View style={styles.classSelectorRow}>
                  {appData.classes.map((classItem) => (
                    <TouchableOpacity
                      key={classItem.id}
                      activeOpacity={0.86}
                      onPress={() => {
                        setAppData((current) => ({
                          ...current,
                          selectedClassId: classItem.id,
                        }));
                        setCurrentScreen("classes");
                      }}
                      style={[
                        styles.classChip,
                        classItem.id === selectedClass.id && styles.classChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.classChipText,
                          classItem.id === selectedClass.id && styles.classChipTextActive,
                        ]}
                      >
                        {classItem.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.classActionsRow}>
                  <TouchableOpacity activeOpacity={0.88} onPress={handleAddClass} style={styles.classActionButton}>
                    <Text style={styles.classActionButtonText}>Adicionar nova turma</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.statGrid}>
                <StatCard
                  label="Alunos da turma"
                  value={String(selectedClassSummary.studentCount)}
                  helper="Quantidade cadastrada"
                />
                <StatCard
                  label="Frequencia media"
                  value={`${selectedClassSummary.averageFrequency}%`}
                  helper="Baseada nas presencas"
                />
                <StatCard
                  label="Media das notas"
                  value={selectedClassSummary.averageGradeLabel}
                  helper="Notas validas da turma"
                />
                <StatCard
                  label="Atualizado em"
                  value={formatCompactDate(now)}
                  helper="Data atual do app"
                />
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>Nome da turma</Text>
                <Text style={styles.sectionTitle}>Edite o nome da turma selecionada</Text>

                <TextInput
                  value={classNameDraft}
                  onChangeText={setClassNameDraft}
                  placeholder="Digite o nome da turma"
                  placeholderTextColor="#8D7D72"
                  style={styles.input}
                />

                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={handleSaveClassName}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>Salvar nome da turma</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>Cadastro de aluno</Text>
                <Text style={styles.sectionTitle}>Cadastre um aluno e salve definitivamente</Text>
                <Text style={styles.sectionText}>
                  O nome do aluno e obrigatorio. Serie, notas e observacoes podem ser preenchidas depois.
                </Text>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Nome do aluno (obrigatorio)</Text>
                  <TextInput
                    value={studentForm.name}
                    onChangeText={(value) => updateStudentForm("name", value)}
                    placeholder="Ex.: Ana Souza"
                    placeholderTextColor="#8D7D72"
                    style={styles.input}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Serie (opcional)</Text>
                  <TextInput
                    value={studentForm.gradeLevel}
                    onChangeText={(value) => updateStudentForm("gradeLevel", value)}
                    placeholder="Ex.: 8o ano"
                    placeholderTextColor="#8D7D72"
                    style={styles.input}
                  />
                </View>

                <View style={styles.noteGrid}>
                  {NOTE_FIELDS.map((field) => (
                    <View key={field.key} style={styles.noteCell}>
                      <Text style={styles.inputLabel}>{field.label}</Text>
                      <TextInput
                        value={studentForm[field.key]}
                        onChangeText={(value) => updateStudentForm(field.key, value)}
                        placeholder="0,0"
                        placeholderTextColor="#8D7D72"
                        keyboardType="numeric"
                        style={styles.input}
                      />
                    </View>
                  ))}
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Observacoes</Text>
                  <TextInput
                    value={studentForm.observations}
                    onChangeText={(value) => updateStudentForm("observations", value)}
                    placeholder="Ex.: precisa reforcar matematica, participa bem da aula..."
                    placeholderTextColor="#8D7D72"
                    multiline
                    textAlignVertical="top"
                    style={[styles.input, styles.textArea]}
                  />
                </View>

                <View style={styles.actionRow}>
                  <TouchableOpacity activeOpacity={0.88} onPress={handleCreateStudentSubmit} style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>Salvar aluno</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {isEditingStudent ? (
                <View
                  style={styles.sectionCard}
                  onLayout={({ nativeEvent }) => {
                    editCardOffsetRef.current = nativeEvent.layout.y;
                  }}
                >
                  <Text style={styles.sectionLabel}>Edicao de aluno</Text>
                  <Text style={styles.sectionTitle}>Atualize o aluno selecionado</Text>
                  <Text style={styles.sectionText}>
                    Aqui o professor pode corrigir nome, serie, notas, observacoes, presencas e faltas.
                  </Text>

                  <View style={styles.formGroup}>
                    <Text style={styles.inputLabel}>Nome do aluno (obrigatorio)</Text>
                    <TextInput
                      value={editStudentForm.name}
                      onChangeText={(value) => updateEditStudentForm("name", value)}
                      placeholder="Ex.: Ana Souza"
                      placeholderTextColor="#8D7D72"
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.inputLabel}>Serie (opcional)</Text>
                    <TextInput
                      value={editStudentForm.gradeLevel}
                      onChangeText={(value) => updateEditStudentForm("gradeLevel", value)}
                      placeholder="Ex.: 8o ano"
                      placeholderTextColor="#8D7D72"
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.noteGrid}>
                    <View style={styles.noteCell}>
                      <Text style={styles.inputLabel}>Presencas</Text>
                      <TextInput
                        value={editStudentForm.presences}
                        onChangeText={(value) => updateEditStudentForm("presences", value)}
                        placeholder="0"
                        placeholderTextColor="#8D7D72"
                        keyboardType="number-pad"
                        style={styles.input}
                      />
                    </View>

                    <View style={styles.noteCell}>
                      <Text style={styles.inputLabel}>Faltas</Text>
                      <TextInput
                        value={editStudentForm.absences}
                        onChangeText={(value) => updateEditStudentForm("absences", value)}
                        placeholder="0"
                        placeholderTextColor="#8D7D72"
                        keyboardType="number-pad"
                        style={styles.input}
                      />
                    </View>
                  </View>

                  <View style={styles.noteGrid}>
                    {NOTE_FIELDS.map((field) => (
                      <View key={`edit-${field.key}`} style={styles.noteCell}>
                        <Text style={styles.inputLabel}>{field.label}</Text>
                        <TextInput
                          value={editStudentForm[field.key]}
                          onChangeText={(value) => updateEditStudentForm(field.key, value)}
                          placeholder="0,0"
                          placeholderTextColor="#8D7D72"
                          keyboardType="numeric"
                          style={styles.input}
                        />
                      </View>
                    ))}
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.inputLabel}>Observacoes</Text>
                    <TextInput
                      value={editStudentForm.observations}
                      onChangeText={(value) => updateEditStudentForm("observations", value)}
                      placeholder="Ex.: precisa reforcar matematica, participa bem da aula..."
                      placeholderTextColor="#8D7D72"
                      multiline
                      textAlignVertical="top"
                      style={[styles.input, styles.textArea]}
                    />
                  </View>

                  <View style={styles.actionRow}>
                    <TouchableOpacity activeOpacity={0.88} onPress={handleEditStudentSubmit} style={styles.primaryButton}>
                      <Text style={styles.primaryButtonText}>Salvar alteracoes do aluno</Text>
                    </TouchableOpacity>

                    <TouchableOpacity activeOpacity={0.88} onPress={clearEditStudentForm} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Cancelar edicao</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>Alunos cadastrados</Text>
                <Text style={styles.sectionTitle}>{selectedClass.name}</Text>

                {selectedClassStudents.length ? (
                  selectedClassStudents.map((student, index) => (
                    <StudentCard
                      key={student.id}
                      position={index + 1}
                      student={student}
                      onEdit={() => handleStartEditing(student)}
                      onDelete={() => handleDeleteStudent(student.id)}
                      onPresence={() => handleAttendanceUpdate(student.id, "presences")}
                      onAbsence={() => handleAttendanceUpdate(student.id, "absences")}
                    />
                  ))
                ) : (
                  <EmptyState
                    title="Nenhum aluno nesta turma"
                    description="Adicione um aluno para comecar a registrar frequencia, notas e observacoes."
                  />
                )}
              </View>
            </>
          ) : null}

          {currentScreen === "report" ? (
            <>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>Relatorio geral</Text>
                <Text style={styles.sectionTitle}>Tudo o que foi salvo aparece aqui</Text>
                <Text style={styles.sectionText}>
                  O relatorio mostra turma, serie, frequencia, notas, media das notas, observacoes e datas.
                </Text>
              </View>

              <View style={styles.statGrid}>
                <StatCard label="Total de turmas" value={String(appData.classes.length)} helper="Sempre editaveis" />
                <StatCard label="Total de alunos" value={String(globalSummary.studentCount)} helper="Somadas todas as turmas" />
                <StatCard
                  label="Frequencia media geral"
                  value={`${globalSummary.averageFrequency}%`}
                  helper="Media dos alunos"
                />
                <StatCard
                  label="Media geral das notas"
                  value={globalSummary.averageGradeLabel}
                  helper="Notas preenchidas"
                />
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>Arquivo do relatorio</Text>
                <Text style={styles.sectionTitle}>Gere o relatorio individual de uma turma no Android</Text>
                <Text style={styles.sectionText}>
                  Escolha uma turma abaixo e o app gera um arquivo .txt com alunos, frequencia, notas, observacoes e datas para compartilhar.
                </Text>

                <View style={styles.classSelectorRow}>
                  {appData.classes.map((classItem) => (
                    <TouchableOpacity
                      key={classItem.id}
                      activeOpacity={0.86}
                      onPress={() => setReportClassId(classItem.id)}
                      style={[
                        styles.classChip,
                        classItem.id === selectedReportClass.id && styles.classChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.classChipText,
                          classItem.id === selectedReportClass.id && styles.classChipTextActive,
                        ]}
                      >
                        {classItem.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.reportStatusText}>
                  Turma escolhida: {selectedReportClass.name}. {selectedReportClass.students.length} alunos nesta turma.
                </Text>

                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={handleGenerateSelectedClassReport}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>Gerar relatorio da turma escolhida</Text>
                </TouchableOpacity>

                <Text style={styles.reportStatusText}>{reportStatus}</Text>
              </View>

              {appData.classes.map((classItem) => {
                const classStudents = sortStudentsByName(classItem.students);
                const classSummary = calculateClassSummary(classStudents);

                return (
                  <View key={classItem.id} style={styles.sectionCard}>
                    <Text style={styles.sectionLabel}>Turma</Text>
                    <Text style={styles.sectionTitle}>{classItem.name}</Text>
                    <Text style={styles.sectionText}>
                      {classSummary.studentCount} alunos  Frequencia media {classSummary.averageFrequency}%  Media das notas {classSummary.averageGradeLabel}
                    </Text>

                    {classStudents.length ? (
                      classStudents.map((student, index) => (
                        <ReportCard
                          key={student.id}
                          position={index + 1}
                          student={student}
                          className={classItem.name}
                        />
                      ))
                    ) : (
                      <EmptyState
                        title="Sem alunos no relatorio"
                        description="Esta turma ainda nao possui alunos cadastrados."
                      />
                    )}
                  </View>
                );
              })}
            </>
          ) : null}

          {currentScreen === "data" ? (
            <>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>Dados do app</Text>
                <Text style={styles.sectionTitle}>Gerencie o armazenamento local com seguranca</Text>
                <Text style={styles.sectionText}>
                  Cada cadastro e salvo automaticamente. A exclusao de aluno e definitiva e o reset apaga todas as informacoes.
                </Text>
              </View>

              <View style={styles.statGrid}>
                <StatCard
                  label="Salvamento"
                  value="Automatico"
                  helper={saveStatus.lastSavedAt ? formatDateTime(saveStatus.lastSavedAt) : "Aguardando primeiro salvamento"}
                />
                <StatCard
                  label="Turma ativa"
                  value={selectedClass.name}
                  helper="Selecionada na tela de turmas"
                />
                <StatCard
                  label="Ultimo reset"
                  value={appData.lastResetAt ? formatCompactDate(appData.lastResetAt) : "Nenhum"}
                  helper="Historico local"
                />
                <StatCard
                  label="Data de hoje"
                  value={formatCompactDate(now)}
                  helper="Atualizada automaticamente"
                />
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>Reset geral</Text>
                <Text style={styles.sectionTitle}>Apague todas as informacoes do app</Text>
                <Text style={styles.sectionText}>
                  Esta acao remove de forma definitiva os nomes, frequencias, notas, observacoes e nomes das turmas.
                </Text>

                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={handleResetAll}
                  style={styles.dangerButton}
                >
                  <Text style={styles.dangerButtonText}>Resetar tudo definitivamente</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  function updateStudentForm(field, value) {
    setStudentForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateEditStudentForm(field, value) {
    setEditStudentForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function clearStudentForm() {
    setStudentForm(createEmptyStudentForm());
  }

  function clearEditStudentForm() {
    setEditStudentForm(createEmptyEditStudentForm());
    setEditingStudentId(null);
  }

  function handleSaveClassName() {
    const nextName = classNameDraft.trim();

    if (!nextName) {
      Alert.alert("Nome da turma", "Digite um nome valido para a turma antes de salvar.");
      return;
    }

    setAppData((current) => ({
      ...current,
      classes: current.classes.map((classItem) =>
        classItem.id === current.selectedClassId
          ? {
              ...classItem,
              name: nextName,
            }
          : classItem
      ),
    }));

    Alert.alert("Turma atualizada", "O novo nome da turma foi salvo no aparelho.");
  }

  function handleAddClass() {
    const nextNumber = appData.classes.length + 1;
    const newClassId = generateId("class");
    const newClass = {
      id: newClassId,
      name: `Turma ${nextNumber}`,
      students: [],
    };

    setAppData((current) => ({
      ...current,
      selectedClassId: newClassId,
      classes: [...current.classes, newClass],
    }));

    setClassNameDraft(newClass.name);
    Alert.alert("Nova turma", "Uma nova turma foi criada e ja ficou pronta para edicao.");
  }

  function handleCreateStudentSubmit() {
    const name = studentForm.name.trim();
    const gradeLevel = studentForm.gradeLevel.trim() || "-";

    if (!name) {
      Alert.alert("Campo obrigatorio", "Preencha pelo menos o nome do aluno antes de salvar.");
      return;
    }

    const timestamp = Date.now();
    const studentPayload = buildStudentPayloadFromForm(studentForm, name, gradeLevel);

    setAppData((current) => ({
      ...current,
      classes: current.classes.map((classItem) => {
        if (classItem.id !== current.selectedClassId) {
          return classItem;
        }

        return {
          ...classItem,
          students: sortStudentsByName([
            ...classItem.students,
            {
              id: generateId("student"),
              ...studentPayload,
              presences: 0,
              absences: 0,
              createdAt: timestamp,
              updatedAt: timestamp,
              lastAttendanceAt: null,
            },
          ]),
        };
      }),
    }));

    clearStudentForm();
    Alert.alert("Aluno salvo", "O nome do aluno foi salvo definitivamente no aparelho.");
  }

  function handleEditStudentSubmit() {
    if (!editingStudentId) {
      return;
    }

    const name = editStudentForm.name.trim();
    const gradeLevel = editStudentForm.gradeLevel.trim() || "-";

    if (!name) {
      Alert.alert("Campo obrigatorio", "Preencha pelo menos o nome do aluno antes de salvar.");
      return;
    }

    let presences = 0;
    let absences = 0;

    try {
      presences = parseNonNegativeIntegerInput(editStudentForm.presences, "Presencas");
      absences = parseNonNegativeIntegerInput(editStudentForm.absences, "Faltas");
    } catch (error) {
      Alert.alert("Edicao de aluno", error.message);
      return;
    }

    const timestamp = Date.now();
    const studentPayload = buildStudentPayloadFromForm(editStudentForm, name, gradeLevel);

    setAppData((current) => ({
      ...current,
      classes: current.classes.map((classItem) => {
        if (classItem.id !== current.selectedClassId) {
          return classItem;
        }

        return {
          ...classItem,
          students: sortStudentsByName(
            classItem.students.map((student) =>
              student.id === editingStudentId
                ? {
                    ...student,
                    ...studentPayload,
                    presences,
                    absences,
                    updatedAt: timestamp,
                  }
                : student
            )
          ),
        };
      }),
    }));

    clearEditStudentForm();
    Alert.alert("Aluno atualizado", "As alteracoes do aluno foram salvas definitivamente no aparelho.");
  }

  function handleStartEditing(student) {
    setEditingStudentId(student.id);
    setEditStudentForm({
      name: student.name,
      gradeLevel: student.gradeLevel,
      presences: String(student.presences),
      absences: String(student.absences),
      note1: student.note1,
      note2: student.note2,
      note3: student.note3,
      note4: student.note4,
      observations: student.observations,
    });

    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, editCardOffsetRef.current - 16),
          animated: true,
        });
      }, 80);
    });
  }

  function handleAttendanceUpdate(studentId, field) {
    const timestamp = Date.now();

    setAppData((current) => ({
      ...current,
      classes: current.classes.map((classItem) => {
        if (classItem.id !== current.selectedClassId) {
          return classItem;
        }

        return {
          ...classItem,
          students: classItem.students.map((student) =>
            student.id === studentId
              ? {
                  ...student,
                  [field]: student[field] + 1,
                  updatedAt: timestamp,
                  lastAttendanceAt: timestamp,
                }
              : student
          ),
        };
      }),
    }));
  }

  function handleDeleteStudent(studentId) {
    Alert.alert(
      "Apagar aluno",
      "Esta exclusao e definitiva e remove o aluno do aparelho e do relatorio. Deseja continuar?",
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Apagar definitivamente",
          style: "destructive",
          onPress: () => {
            setAppData((current) => ({
              ...current,
              classes: current.classes.map((classItem) => {
                if (classItem.id !== current.selectedClassId) {
                  return classItem;
                }

                return {
                  ...classItem,
                  students: classItem.students.filter((student) => student.id !== studentId),
                };
              }),
            }));

            if (editingStudentId === studentId) {
              clearEditStudentForm();
            }
          },
        },
      ]
    );
  }

  async function handleGenerateSelectedClassReport() {
    if (!selectedReportClass) {
      Alert.alert("Relatorio", "Escolha uma turma antes de gerar o relatorio.");
      return;
    }

    if (!FileSystem.documentDirectory) {
      Alert.alert("Relatorio", "O armazenamento local do aparelho nao esta disponivel agora.");
      return;
    }

    const timestamp = Date.now();
    const fileName = `relatorio-${sanitizeFilePart(selectedReportClass.name)}-${formatFileDateForName(timestamp)}.pdf`;
    const reportDirectory = `${FileSystem.documentDirectory}relatorios`;
    const fileUri = `${reportDirectory}/${fileName}`;

    setReportStatus(`Gerando relatorio da turma ${selectedReportClass.name}...`);

    try {
      await FileSystem.makeDirectoryAsync(reportDirectory, { intermediates: true });
      const reportLogoBase64 = await getReportLogoBase64();
      const pdfBase64 = await buildClassReportPdfBase64(selectedReportClass, timestamp, reportLogoBase64);
      await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const canShare = await Sharing.isAvailableAsync().catch(() => false);

      if (canShare) {
        try {
          await Sharing.shareAsync(fileUri, {
            mimeType: "application/pdf",
            dialogTitle: `Relatorio da turma ${selectedReportClass.name}`,
          });
          setReportStatus(`Relatorio em PDF pronto e compartilhado em ${formatDateTime(timestamp)}. Arquivo: ${fileName}`);
          return;
        } catch (error) {
          setReportStatus(`Relatorio em PDF salvo no aparelho em ${formatDateTime(timestamp)}. Arquivo: ${fileName}`);
          Alert.alert(
            "Relatorio salvo",
            "O arquivo foi gerado no aparelho, mas o compartilhamento nao abriu agora."
          );
          return;
        }
      }

      setReportStatus(`Relatorio em PDF salvo no aparelho em ${formatDateTime(timestamp)}. Arquivo: ${fileName}`);
      Alert.alert("Relatorio pronto", `O relatorio da turma ${selectedReportClass.name} foi gerado no aparelho.`);
    } catch (error) {
      setReportStatus("Nao foi possivel gerar o relatorio agora.");
      Alert.alert(
        "Relatorio",
        error?.message || "Nao foi possivel gerar ou compartilhar o relatorio desta turma agora."
      );
    }
  }

  function handleResetAll() {
    Alert.alert(
      "Reset geral",
      "Deseja realmente apagar todas as turmas, alunos, frequencias, notas e observacoes? Esta acao e definitiva.",
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Resetar tudo",
          style: "destructive",
          onPress: () => {
            const nextState = createInitialData();
            nextState.lastResetAt = Date.now();
            setAppData(nextState);
            setCurrentScreen("classes");
            clearStudentForm();
            setClassNameDraft(nextState.classes[0].name);
          },
        },
      ]
    );
  }
}

function StudentCard({ student, position, onEdit, onDelete, onPresence, onAbsence }) {
  const gradeAverage = calculateGradeAverage(student);

  return (
    <View style={styles.studentCard}>
      <View style={styles.studentHeaderRow}>
        <View style={styles.studentIdentityRow}>
          <View style={styles.studentOrderBadge}>
            <Text style={styles.studentOrderText}>{formatStudentPosition(position)}</Text>
          </View>

          <View style={styles.studentInitialBadge}>
            <Text style={styles.studentInitialText}>{getStudentInitial(student.name)}</Text>
          </View>

          <View style={styles.studentTitleBlock}>
            <Text style={styles.studentName}>{student.name}</Text>
            <Text style={styles.studentMeta}>Serie: {student.gradeLevel}</Text>
          </View>
        </View>

        <View style={styles.studentPill}>
          <Text style={styles.studentPillText}>{calculateFrequency(student)}%</Text>
        </View>
      </View>

      <View style={styles.badgeRow}>
        <Badge label={`Presencas ${student.presences}`} tone="green" />
        <Badge label={`Faltas ${student.absences}`} tone="orange" />
        <Badge label={`Media notas ${formatAverageLabel(gradeAverage)}`} tone="teal" />
      </View>

      <Text style={styles.studentObservation} numberOfLines={2}>
        {student.observations ? `Observacoes: ${student.observations}` : "Observacoes: sem registro."}
      </Text>

      <Text style={styles.dateNote}>Ultima atualizacao: {formatDateTime(student.updatedAt)}</Text>

      <View style={styles.actionRow}>
        <SmallActionButton label="+ Presenca" tone="green" onPress={onPresence} />
        <SmallActionButton label="+ Falta" tone="orange" onPress={onAbsence} />
        <SmallActionButton label="Editar" tone="teal" onPress={onEdit} />
        <SmallActionButton label="Apagar" tone="danger" onPress={onDelete} />
      </View>
    </View>
  );
}

function ReportCard({ student, className, position }) {
  return (
    <View style={styles.reportCard}>
      <View style={styles.reportHeaderRow}>
        <View style={styles.studentIdentityRow}>
          <View style={styles.studentOrderBadge}>
            <Text style={styles.studentOrderText}>{formatStudentPosition(position)}</Text>
          </View>

          <View style={styles.studentInitialBadge}>
            <Text style={styles.studentInitialText}>{getStudentInitial(student.name)}</Text>
          </View>

          <View style={styles.studentTitleBlock}>
            <Text style={styles.reportStudentName}>{student.name}</Text>
            <Text style={styles.studentMeta}>
              {className}  Serie: {student.gradeLevel}
            </Text>
          </View>
        </View>

        <View style={styles.studentPill}>
          <Text style={styles.studentPillText}>{calculateFrequency(student)}%</Text>
        </View>
      </View>

      <Text style={styles.reportLine}>
        Presencas: {student.presences}  Faltas: {student.absences}  Media das notas: {formatAverageLabel(calculateGradeAverage(student))}
      </Text>

      <Text style={styles.reportLine}>
        Notas: {formatNote(student.note1)} | {formatNote(student.note2)} | {formatNote(student.note3)} | {formatNote(student.note4)}
      </Text>

      <Text style={styles.reportObservation}>
        Observacoes: {student.observations ? student.observations : "sem observacoes registradas."}
      </Text>

      <Text style={styles.dateNote}>Cadastrado em: {formatDateTime(student.createdAt)}</Text>
      <Text style={styles.dateNote}>Ultima atualizacao: {formatDateTime(student.updatedAt)}</Text>
      <Text style={styles.dateNote}>
        Ultima chamada: {student.lastAttendanceAt ? formatDateTime(student.lastAttendanceAt) : "nenhuma chamada registrada."}
      </Text>
    </View>
  );
}

function StatCard({ label, value, helper }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statHelper}>{helper}</Text>
    </View>
  );
}

function Badge({ label, tone }) {
  return (
    <View
      style={[
        styles.badge,
        tone === "green" && styles.badgeGreen,
        tone === "orange" && styles.badgeOrange,
        tone === "teal" && styles.badgeTeal,
      ]}
    >
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function SmallActionButton({ label, tone, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
      style={[
        styles.smallActionButton,
        tone === "green" && styles.smallActionButtonGreen,
        tone === "orange" && styles.smallActionButtonOrange,
        tone === "teal" && styles.smallActionButtonTeal,
        tone === "danger" && styles.smallActionButtonDanger,
      ]}
    >
      <Text style={styles.smallActionButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function EmptyState({ title, description }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateText}>{description}</Text>
    </View>
  );
}

function createInitialData() {
  const defaultClasses = createDefaultClasses();
  return {
    selectedClassId: defaultClasses[0].id,
    classes: defaultClasses,
    lastResetAt: null,
  };
}

function createEmptyStudentForm() {
  return {
    name: "",
    gradeLevel: "",
    note1: "",
    note2: "",
    note3: "",
    note4: "",
    observations: "",
  };
}

function createEmptyEditStudentForm() {
  return {
    name: "",
    gradeLevel: "",
    presences: "0",
    absences: "0",
    note1: "",
    note2: "",
    note3: "",
    note4: "",
    observations: "",
  };
}

function buildStudentPayloadFromForm(form, name, gradeLevel) {
  return {
    name,
    gradeLevel,
    note1: form.note1.trim(),
    note2: form.note2.trim(),
    note3: form.note3.trim(),
    note4: form.note4.trim(),
    observations: form.observations.trim(),
  };
}

function normalizeAppData(rawValue) {
  const initialData = createInitialData();
  const classes = Array.isArray(rawValue?.classes) && rawValue.classes.length
    ? rawValue.classes.map((classItem, index) => normalizeClass(classItem, index + 1))
    : initialData.classes;

  return {
    selectedClassId: classes.some((classItem) => classItem.id === rawValue?.selectedClassId)
      ? rawValue.selectedClassId
      : initialData.selectedClassId,
    classes,
    lastResetAt: toNumberOrNull(rawValue?.lastResetAt),
  };
}

function normalizeClass(rawClass, position) {
  return {
    id: rawClass?.id || `class-${position}`,
    name: rawClass?.name?.trim() ? rawClass.name.trim() : `Turma ${position}`,
    students: Array.isArray(rawClass?.students) ? sortStudentsByName(rawClass.students.map(normalizeStudent)) : [],
  };
}

function createDefaultClasses() {
  return Array.from({ length: 3 }, (_, index) => ({
    id: `class-${index + 1}`,
    name: `Turma ${index + 1}`,
    students: [],
  }));
}

function normalizeStudent(rawStudent) {
  const createdAt = toNumberOrNow(rawStudent?.createdAt);

  return {
    id: rawStudent?.id || generateId("student"),
    name: textOrFallback(rawStudent?.name, "Aluno sem nome"),
    gradeLevel: textOrFallback(rawStudent?.gradeLevel, "-"),
    note1: toText(rawStudent?.note1),
    note2: toText(rawStudent?.note2),
    note3: toText(rawStudent?.note3),
    note4: toText(rawStudent?.note4),
    observations: toText(rawStudent?.observations),
    presences: toNumberOrZero(rawStudent?.presences),
    absences: toNumberOrZero(rawStudent?.absences),
    createdAt,
    updatedAt: toNumberOrFallback(rawStudent?.updatedAt, createdAt),
    lastAttendanceAt: toNumberOrNull(rawStudent?.lastAttendanceAt),
  };
}

function sortStudentsByName(students) {
  return [...students].sort((leftStudent, rightStudent) =>
    textOrFallback(leftStudent?.name, "").localeCompare(textOrFallback(rightStudent?.name, ""), "pt-BR", {
      sensitivity: "base",
      numeric: true,
    })
  );
}

async function getReportLogoBase64() {
  if (!REPORT_LOGO_BASE64) {
    throw new Error("Logo do relatorio nao encontrado.");
  }

  return REPORT_LOGO_BASE64;
}

async function buildClassReportPdfBase64(classItem, timestamp, logoBase64) {
  const pdfDoc = await PDFDocument.create();
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
  const logoImage = await pdfDoc.embedPng(`data:image/png;base64,${logoBase64}`);
  const students = sortStudentsByName(classItem.students);
  const summary = calculateClassSummary(students);
  const colors = {
    ink: rgbFromHex("#223341"),
    brand: rgbFromHex("#A34D29"),
    muted: rgbFromHex("#5D6B75"),
    panel: rgbFromHex("#FFF8F1"),
    panelBorder: rgbFromHex("#E8D7C8"),
    card: rgbFromHex("#FFFFFF"),
    cardBorder: rgbFromHex("#E6D9CD"),
    accent: rgbFromHex("#214F68"),
    soft: rgbFromHex("#FEF4EA"),
    softBorder: rgbFromHex("#EDD6C4"),
    metricPanel: rgbFromHex("#F8F2EB"),
    metricBorder: rgbFromHex("#EEE0D2"),
    footerBorder: rgbFromHex("#EEE1D5"),
  };

  let page = pdfDoc.addPage([PDF_REPORT_PAGE.width, PDF_REPORT_PAGE.height]);
  let cursorY = PDF_REPORT_PAGE.height - PDF_REPORT_PAGE.margin;
  cursorY = drawPdfReportHeader(page, fonts, colors, classItem.name, timestamp, logoImage, false, cursorY);
  cursorY = drawPdfSummary(page, fonts, colors, summary, cursorY);

  students.forEach((student, index) => {
    const model = createPdfStudentCardModel(student, index + 1, fonts);

    if (cursorY - model.height < PDF_REPORT_PAGE.margin) {
      page = pdfDoc.addPage([PDF_REPORT_PAGE.width, PDF_REPORT_PAGE.height]);
      cursorY = PDF_REPORT_PAGE.height - PDF_REPORT_PAGE.margin;
      cursorY = drawPdfReportHeader(page, fonts, colors, `${classItem.name} - continuacao`, timestamp, logoImage, true, cursorY);
    }

    cursorY = drawPdfStudentCard(page, fonts, colors, model, cursorY);
  });

  return pdfDoc.saveAsBase64({ dataUri: false });
}

function drawPdfReportHeader(page, fonts, colors, className, timestamp, logoImage, isContinuation, cursorY) {
  const x = PDF_REPORT_PAGE.margin;
  const width = PDF_REPORT_PAGE.width - PDF_REPORT_PAGE.margin * 2;
  const height = isContinuation ? 94 : 132;
  const y = cursorY - height;
  const innerX = x + 16;
  const innerTop = cursorY - 16;
  const logoWidth = isContinuation ? 128 : 164;
  const logoHeight = logoWidth * (PDF_REPORT_LOGO_SIZE.height / PDF_REPORT_LOGO_SIZE.width);
  const textWidth = width - logoWidth - 42;

  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: colors.panel,
    borderColor: colors.panelBorder,
    borderWidth: 1,
  });

  const eyebrowLines = [normalizePdfText("APP DE CHAMADA")];
  drawPdfTextLines(page, eyebrowLines, innerX, innerTop, {
    font: fonts.bold,
    size: 10,
    lineHeight: 12,
    color: colors.brand,
  });

  const titleLines = wrapPdfText(
    normalizePdfText(isContinuation ? `Relatorio da turma ${className}` : `Relatorio da turma ${className}`),
    fonts.bold,
    isContinuation ? 18 : 22,
    textWidth
  );
  const titleTop = innerTop - 18;
  drawPdfTextLines(page, titleLines, innerX, titleTop, {
    font: fonts.bold,
    size: isContinuation ? 18 : 22,
    lineHeight: isContinuation ? 22 : 26,
    color: colors.ink,
  });

  const subtitle = isContinuation
    ? normalizePdfText(`Continuacao do relatorio gerado em ${formatDateTime(timestamp)}.`)
    : normalizePdfText(`Gerado em ${formatDateTime(timestamp)}. Relatorio individual com frequencia, notas, observacoes e datas dos alunos.`);
  const subtitleLines = wrapPdfText(subtitle, fonts.regular, 10.5, textWidth);
  const subtitleTop = titleTop - titleLines.length * (isContinuation ? 22 : 26) - 4;
  drawPdfTextLines(page, subtitleLines, innerX, subtitleTop, {
    font: fonts.regular,
    size: 10.5,
    lineHeight: 14,
    color: colors.muted,
  });

  page.drawImage(logoImage, {
    x: x + width - 16 - logoWidth,
    y: y + height - 16 - logoHeight,
    width: logoWidth,
    height: logoHeight,
  });

  return y - 18;
}

function drawPdfSummary(page, fonts, colors, summary, cursorY) {
  const gap = 12;
  const width = PDF_REPORT_PAGE.width - PDF_REPORT_PAGE.margin * 2;
  const cardWidth = (width - gap * 2) / 3;
  const cardHeight = 74;
  const x = PDF_REPORT_PAGE.margin;
  const y = cursorY - cardHeight;
  const entries = [
    { label: "Total de alunos", value: String(summary.studentCount) },
    { label: "Frequencia media", value: `${summary.averageFrequency}%` },
    { label: "Media das notas", value: normalizePdfText(summary.averageGradeLabel) },
  ];

  entries.forEach((entry, index) => {
    const cardX = x + index * (cardWidth + gap);
    page.drawRectangle({
      x: cardX,
      y,
      width: cardWidth,
      height: cardHeight,
      color: colors.soft,
      borderColor: colors.softBorder,
      borderWidth: 1,
    });

    drawPdfTextLines(page, wrapPdfText(normalizePdfText(entry.label), fonts.bold, 10, cardWidth - 24), cardX + 12, y + cardHeight - 12, {
      font: fonts.bold,
      size: 10,
      lineHeight: 12,
      color: colors.brand,
    });
    drawPdfTextLines(page, [normalizePdfText(entry.value)], cardX + 12, y + cardHeight - 38, {
      font: fonts.bold,
      size: 22,
      lineHeight: 24,
      color: colors.ink,
    });
  });

  return y - 18;
}

function createPdfStudentCardModel(student, position, fonts) {
  const innerWidth = PDF_REPORT_PAGE.width - PDF_REPORT_PAGE.margin * 2 - 28;
  const titleWidth = innerWidth - 82;
  const titleLines = wrapPdfText(
    normalizePdfText(`${formatStudentPosition(position)} - ${student.name}`),
    fonts.bold,
    14,
    titleWidth
  );
  const gradeLine = normalizePdfText(`Serie: ${student.gradeLevel}`);
  const notesLines = wrapPdfText(
    normalizePdfText(`Notas: ${formatNote(student.note1)} | ${formatNote(student.note2)} | ${formatNote(student.note3)} | ${formatNote(student.note4)}`),
    fonts.regular,
    10.5,
    innerWidth
  );
  const observationLines = wrapPdfText(
    normalizePdfText(`Observacoes: ${student.observations ? student.observations : "sem observacoes registradas."}`),
    fonts.regular,
    10.5,
    innerWidth
  );
  const footerLines = [
    normalizePdfText(`Cadastrado em: ${formatDateTime(student.createdAt)}`),
    normalizePdfText(`Ultima atualizacao: ${formatDateTime(student.updatedAt)}`),
    normalizePdfText(`Ultima chamada: ${student.lastAttendanceAt ? formatDateTime(student.lastAttendanceAt) : "nenhuma chamada registrada."}`),
  ];

  const titleHeight = titleLines.length * 18;
  const topHeight = titleHeight + 16 + 12;
  const metricHeight = 44;
  const notesHeight = notesLines.length * 14 + 6;
  const observationHeight = observationLines.length * 14 + 6;
  const footerHeight = footerLines.length * 12 + 12;
  const height = 18 + topHeight + 12 + metricHeight + 12 + notesHeight + 8 + observationHeight + 14 + footerHeight + 18;

  return {
    student,
    position,
    titleLines,
    gradeLine,
    notesLines,
    observationLines,
    footerLines,
    height,
  };
}

function drawPdfStudentCard(page, fonts, colors, model, cursorY) {
  const x = PDF_REPORT_PAGE.margin;
  const width = PDF_REPORT_PAGE.width - PDF_REPORT_PAGE.margin * 2;
  const y = cursorY - model.height;
  const innerX = x + 14;
  const innerWidth = width - 28;
  const innerTop = cursorY - 14;
  let currentTop = innerTop;

  page.drawRectangle({
    x,
    y,
    width,
    height: model.height,
    color: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
  });

  drawPdfTextLines(page, model.titleLines, innerX, currentTop, {
    font: fonts.bold,
    size: 14,
    lineHeight: 18,
    color: colors.ink,
  });
  currentTop -= model.titleLines.length * 18;

  drawPdfTextLines(page, [model.gradeLine], innerX, currentTop - 2, {
    font: fonts.regular,
    size: 9.5,
    lineHeight: 12,
    color: colors.muted,
  });

  drawPdfTextLines(page, [normalizePdfText(`${calculateFrequency(model.student)}%`)], x + width - 60, innerTop, {
    font: fonts.bold,
    size: 18,
    lineHeight: 20,
    color: colors.accent,
  });

  currentTop -= 22;

  const metricGap = 10;
  const metricWidth = (innerWidth - metricGap * 2) / 3;
  const metricY = currentTop - 44;
  const metrics = [
    { label: "Presencas", value: String(model.student.presences) },
    { label: "Faltas", value: String(model.student.absences) },
    { label: "Media", value: normalizePdfText(formatAverageLabel(calculateGradeAverage(model.student))) },
  ];

  metrics.forEach((metric, index) => {
    const metricX = innerX + index * (metricWidth + metricGap);
    page.drawRectangle({
      x: metricX,
      y: metricY,
      width: metricWidth,
      height: 44,
      color: colors.metricPanel,
      borderColor: colors.metricBorder,
      borderWidth: 1,
    });
    drawPdfTextLines(page, [normalizePdfText(metric.label)], metricX + 10, metricY + 31, {
      font: fonts.bold,
      size: 8.5,
      lineHeight: 10,
      color: colors.brand,
    });
    drawPdfTextLines(page, [normalizePdfText(metric.value)], metricX + 10, metricY + 17, {
      font: fonts.bold,
      size: 13,
      lineHeight: 14,
      color: colors.ink,
    });
  });

  currentTop = metricY - 12;

  drawPdfTextLines(page, model.notesLines, innerX, currentTop, {
    font: fonts.regular,
    size: 10.5,
    lineHeight: 14,
    color: colors.ink,
  });
  currentTop -= model.notesLines.length * 14 + 8;

  drawPdfTextLines(page, model.observationLines, innerX, currentTop, {
    font: fonts.regular,
    size: 10.5,
    lineHeight: 14,
    color: colors.ink,
  });
  currentTop -= model.observationLines.length * 14 + 10;

  page.drawLine({
    start: { x: innerX, y: currentTop },
    end: { x: innerX + innerWidth, y: currentTop },
    thickness: 1,
    color: colors.footerBorder,
  });

  currentTop -= 10;

  drawPdfTextLines(page, model.footerLines, innerX, currentTop, {
    font: fonts.regular,
    size: 9,
    lineHeight: 12,
    color: colors.muted,
  });

  return y - 14;
}

function drawPdfTextLines(page, lines, x, topY, options) {
  const font = options.font;
  const size = options.size;
  const lineHeight = options.lineHeight;
  const color = options.color;
  let cursorY = topY - size;

  lines.forEach((line) => {
    page.drawText(line, {
      x,
      y: cursorY,
      size,
      font,
      color,
    });
    cursorY -= lineHeight;
  });
}

function wrapPdfText(text, font, size, maxWidth) {
  const normalized = normalizePdfText(text);
  const words = normalized.split(/\s+/).filter(Boolean);

  if (!words.length) {
    return [""];
  }

  const lines = [];
  let currentLine = words[0];

  for (let index = 1; index < words.length; index += 1) {
    const nextWord = words[index];
    const candidate = `${currentLine} ${nextWord}`;

    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);
    currentLine = nextWord;
  }

  lines.push(currentLine);
  return lines;
}

function normalizePdfText(value) {
  return textOrFallback(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-");
}

function rgbFromHex(value) {
  const normalized = value.replace("#", "");
  const safeValue = normalized.length === 3
    ? normalized
        .split("")
        .map((chunk) => `${chunk}${chunk}`)
        .join("")
    : normalized;

  const red = Number.parseInt(safeValue.slice(0, 2), 16) / 255;
  const green = Number.parseInt(safeValue.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(safeValue.slice(4, 6), 16) / 255;
  return rgb(red, green, blue);
}

function buildClassReportHtml(classItem, timestamp, logoSource) {
  const students = sortStudentsByName(classItem.students);
  const summary = calculateClassSummary(students);
  const studentCards = students.length
    ? students
        .map((student, index) => {
          const observation = student.observations ? escapeHtml(student.observations) : "Sem observacoes registradas.";

          return `
            <section class="student-card">
              <div class="student-card-header">
                <div class="student-card-title">
                  <div class="student-badges">
                    <span class="student-order">${formatStudentPosition(index + 1)}</span>
                    <span class="student-initial">${escapeHtml(getStudentInitial(student.name))}</span>
                  </div>
                  <div>
                    <h3>${escapeHtml(student.name)}</h3>
                    <p>Serie: ${escapeHtml(student.gradeLevel)}</p>
                  </div>
                </div>
                <div class="student-frequency">${calculateFrequency(student)}%</div>
              </div>
              <div class="student-grid">
                <div class="student-metric"><strong>Presencas</strong><span>${student.presences}</span></div>
                <div class="student-metric"><strong>Faltas</strong><span>${student.absences}</span></div>
                <div class="student-metric"><strong>Media</strong><span>${formatAverageLabel(calculateGradeAverage(student))}</span></div>
              </div>
              <p class="student-notes"><strong>Notas:</strong> ${escapeHtml(formatNote(student.note1))} | ${escapeHtml(formatNote(student.note2))} | ${escapeHtml(formatNote(student.note3))} | ${escapeHtml(formatNote(student.note4))}</p>
              <p class="student-observation"><strong>Observacoes:</strong> ${observation}</p>
              <div class="student-dates">
                <span>Cadastrado em: ${escapeHtml(formatDateTime(student.createdAt))}</span>
                <span>Ultima atualizacao: ${escapeHtml(formatDateTime(student.updatedAt))}</span>
                <span>Ultima chamada: ${escapeHtml(student.lastAttendanceAt ? formatDateTime(student.lastAttendanceAt) : "nenhuma chamada registrada.")}</span>
              </div>
            </section>
          `;
        })
        .join("")
    : `<section class="empty-report">Nenhum aluno cadastrado nesta turma.</section>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Relatorio da turma ${escapeHtml(classItem.name)}</title>
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        padding: 24px;
        font-family: Arial, Helvetica, sans-serif;
        color: #223341;
        background: #f7efe6;
      }
      @page {
        margin: 14px;
      }
      .report-page {
        position: relative;
        min-height: 100%;
        border: 1px solid #e8d7c8;
        border-radius: 24px;
        background: #fffaf4;
        padding: 30px 28px 28px;
      }
      .report-header-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .report-header-copy {
        width: 66%;
        padding-right: 18px;
        vertical-align: top;
      }
      .report-header-logo-cell {
        width: 34%;
        vertical-align: top;
        text-align: right;
      }
      .report-logo {
        display: block;
        width: 176px;
        max-width: 100%;
        height: auto;
        margin-left: auto;
      }
      .eyebrow {
        margin: 0;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: #a34d29;
      }
      .report-title {
        margin: 12px 0 0;
        font-size: 30px;
        line-height: 1.15;
        font-weight: 800;
        color: #223341;
      }
      .report-subtitle {
        margin: 12px 0 0;
        font-size: 14px;
        line-height: 1.6;
        color: #5d6b75;
      }
      .summary-grid {
        margin-top: 22px;
        display: table;
        width: 100%;
        border-spacing: 12px 0;
      }
      .summary-row {
        display: table-row;
      }
      .summary-card {
        display: table-cell;
        width: 33.33%;
        padding: 16px 18px;
        border-radius: 18px;
        background: #fef4ea;
        border: 1px solid #edd6c4;
        vertical-align: top;
      }
      .summary-card strong {
        display: block;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 1.2px;
        color: #a34d29;
      }
      .summary-card span {
        display: block;
        margin-top: 8px;
        font-size: 24px;
        font-weight: 800;
        color: #20323d;
      }
      .student-list {
        margin-top: 22px;
      }
      .student-card {
        margin-top: 14px;
        padding: 18px;
        border-radius: 20px;
        background: #ffffff;
        border: 1px solid #e6d9cd;
      }
      .student-card:first-child {
        margin-top: 0;
      }
      .student-card-header {
        display: table;
        width: 100%;
      }
      .student-card-title,
      .student-frequency {
        display: table-cell;
        vertical-align: top;
      }
      .student-card-title {
        width: 78%;
      }
      .student-badges {
        display: inline-block;
        margin-right: 12px;
        vertical-align: top;
      }
      .student-order,
      .student-initial {
        display: inline-block;
        min-width: 38px;
        padding: 8px 10px;
        border-radius: 999px;
        text-align: center;
        font-size: 12px;
        font-weight: 800;
      }
      .student-order {
        background: #f6e6d5;
        color: #a54f2e;
      }
      .student-initial {
        margin-left: 8px;
        background: #295f73;
        color: #ffffff;
      }
      .student-card-title h3 {
        display: inline-block;
        margin: 0;
        font-size: 20px;
        line-height: 1.2;
      }
      .student-card-title p {
        margin: 6px 0 0;
        font-size: 13px;
        color: #63707a;
      }
      .student-frequency {
        width: 22%;
        text-align: right;
        font-size: 26px;
        font-weight: 800;
        color: #214f68;
      }
      .student-grid {
        margin-top: 14px;
        display: table;
        width: 100%;
        border-spacing: 10px 0;
      }
      .student-metric {
        display: table-cell;
        width: 33.33%;
        padding: 12px 14px;
        border-radius: 14px;
        background: #f8f2eb;
        border: 1px solid #eee0d2;
      }
      .student-metric strong {
        display: block;
        font-size: 11px;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: #7e5a49;
      }
      .student-metric span {
        display: block;
        margin-top: 6px;
        font-size: 18px;
        font-weight: 800;
      }
      .student-notes,
      .student-observation {
        margin: 14px 0 0;
        font-size: 13px;
        line-height: 1.55;
        color: #31424d;
      }
      .student-dates {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid #eee1d5;
      }
      .student-dates span {
        display: block;
        margin-top: 5px;
        font-size: 12px;
        color: #6a737a;
      }
      .student-dates span:first-child {
        margin-top: 0;
      }
      .empty-report {
        margin-top: 20px;
        padding: 20px;
        border-radius: 18px;
        background: #fff;
        border: 1px dashed #d7c1ae;
        font-size: 14px;
        color: #5c6971;
      }
    </style>
  </head>
  <body>
    <main class="report-page">
      <table class="report-header-table" role="presentation">
        <tr>
          <td class="report-header-copy">
            <p class="eyebrow">App de Chamada</p>
            <h1 class="report-title">Relatorio da turma ${escapeHtml(classItem.name)}</h1>
            <p class="report-subtitle">Gerado em ${escapeHtml(formatDateTime(timestamp))}. Relatorio individual com frequencia, notas, observacoes e datas dos alunos.</p>
          </td>
          <td class="report-header-logo-cell">
            ${logoSource ? `<img src="${logoSource}" alt="Logo AlfaTec" class="report-logo" />` : ""}
          </td>
        </tr>
      </table>
      <section class="summary-grid">
        <div class="summary-row">
          <div class="summary-card">
            <strong>Total de alunos</strong>
            <span>${summary.studentCount}</span>
          </div>
          <div class="summary-card">
            <strong>Frequencia media</strong>
            <span>${summary.averageFrequency}%</span>
          </div>
          <div class="summary-card">
            <strong>Media das notas</strong>
            <span>${escapeHtml(summary.averageGradeLabel)}</span>
          </div>
        </div>
      </section>
      <section class="student-list">
        ${studentCards}
      </section>
    </main>
  </body>
</html>`;
}

function calculateClassSummary(students) {
  const studentCount = students.length;
  const averageFrequency = calculateAverageFrequency(students);
  const averageGrade = calculateAverageGrade(students);

  return {
    studentCount,
    averageFrequency,
    averageGrade,
    averageGradeLabel: formatAverageLabel(averageGrade),
  };
}

function calculateGlobalSummary(classes) {
  const allStudents = classes.flatMap((classItem) => classItem.students);
  const studentCount = allStudents.length;
  const averageFrequency = calculateAverageFrequency(allStudents);
  const averageGrade = calculateAverageGrade(allStudents);

  return {
    studentCount,
    averageFrequency,
    averageGrade,
    averageGradeLabel: formatAverageLabel(averageGrade),
  };
}

function calculateAverageFrequency(students) {
  if (!students.length) {
    return 0;
  }

  const total = students.reduce((sum, student) => sum + calculateFrequency(student), 0);
  return Math.round(total / students.length);
}

function calculateFrequency(student) {
  const total = student.presences + student.absences;

  if (!total) {
    return 0;
  }

  return Math.round((student.presences / total) * 100);
}

function calculateAverageGrade(students) {
  const grades = students
    .map((student) => calculateGradeAverage(student))
    .filter((value) => value !== null);

  if (!grades.length) {
    return null;
  }

  const total = grades.reduce((sum, value) => sum + value, 0);
  return Math.round((total / grades.length) * 10) / 10;
}

function calculateGradeAverage(student) {
  const notes = NOTE_FIELDS.map((field) => parseNote(student[field.key])).filter((value) => value !== null);

  if (!notes.length) {
    return null;
  }

  const total = notes.reduce((sum, value) => sum + value, 0);
  return Math.round((total / notes.length) * 10) / 10;
}

function parseNote(value) {
  const normalized = toText(value).replace(",", ".");

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNonNegativeIntegerInput(value, fieldLabel) {
  const normalized = toText(value);

  if (!normalized) {
    return 0;
  }

  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Digite um numero inteiro valido em ${fieldLabel}.`);
  }

  return Number(normalized);
}

function formatAverageLabel(value) {
  if (value === null) {
    return "-";
  }

  return value.toFixed(1).replace(".", ",");
}

function formatNote(value) {
  return toText(value) || "-";
}

function formatStudentPosition(position) {
  return String(position).padStart(2, "0");
}

function formatLiveDate(timestamp) {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatFileDateForName(timestamp) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(new Date(timestamp))
    .replace(/\//g, "-");
}

function formatCompactDate(timestamp) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(timestamp));
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toText(value) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function textOrFallback(value, fallback) {
  const text = toText(value);
  return text || fallback;
}

function getStudentInitial(value) {
  return textOrFallback(value, "A").charAt(0).toUpperCase();
}

function sanitizeFilePart(value) {
  return textOrFallback(value, "turma")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return textOrFallback(value, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(value) {
  return textOrFallback(value, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toNumberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumberOrNow(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function toNumberOrFallback(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F4EADD",
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 44,
    gap: 16,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: "#F4EADD",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingTitle: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: "800",
    color: "#21313D",
    textAlign: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    color: "#5E6B74",
  },
  heroCard: {
    position: "relative",
    padding: 22,
    borderRadius: 26,
    backgroundColor: "#FFF8F1",
    borderWidth: 1,
    borderColor: "#F2D7C3",
    shadowColor: "#A3491F",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  heroHeaderRow: {
    position: "relative",
    minHeight: 108,
  },
  heroTextColumn: {
    minWidth: 0,
    paddingRight: 160,
  },
  eyebrow: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontWeight: "800",
    color: "#A34D29",
  },
  heroTitle: {
    marginTop: 10,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "900",
    color: "#223341",
  },
  heroText: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: "#41515D",
    textTransform: "capitalize",
  },
  heroMeta: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: "#6C655E",
  },
  heroLogoShell: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 154,
    height: 120,
    alignItems: "flex-end",
    justifyContent: "flex-start",
    paddingTop: 4,
    paddingRight: 4,
  },
  heroLogo: {
    width: 140,
    height: 108,
  },
  tabRow: {
    flexDirection: "row",
    gap: 10,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 18,
    backgroundColor: "#FFF2E6",
    borderWidth: 1,
    borderColor: "#EED8C6",
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: "#C45D2E",
    borderColor: "#C45D2E",
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#734B35",
  },
  tabButtonTextActive: {
    color: "#FFFDFB",
  },
  sectionCard: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: "#FFFDF9",
    borderWidth: 1,
    borderColor: "#EEDFD1",
    gap: 12,
  },
  sectionLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontWeight: "800",
    color: "#A34D29",
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    color: "#223341",
  },
  sectionText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#5E6B74",
  },
  classSelectorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  classActionsRow: {
    marginTop: 14,
    flexDirection: "row",
  },
  classChip: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#F7EFE7",
    borderWidth: 1,
    borderColor: "#E6D5C8",
  },
  classChipActive: {
    backgroundColor: "#214F5D",
    borderColor: "#214F5D",
  },
  classChipText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#654C3B",
  },
  classChipTextActive: {
    color: "#FFFDFC",
  },
  classActionButton: {
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#214F5D",
  },
  classActionButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFDFC",
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  statCard: {
    width: "48%",
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#FFF7EF",
    borderWidth: 1,
    borderColor: "#EFD9C6",
  },
  statLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "800",
    color: "#A25D3F",
  },
  statValue: {
    marginTop: 8,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "900",
    color: "#21313D",
  },
  statHelper: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: "#6A737B",
  },
  formGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#384550",
  },
  input: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E3D0C0",
    backgroundColor: "#FFF9F4",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#20303B",
  },
  textArea: {
    minHeight: 110,
  },
  noteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  noteCell: {
    width: "48%",
    gap: 8,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryButton: {
    flexGrow: 1,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C45D2E",
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFDFB",
    textAlign: "center",
  },
  secondaryButton: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F0F0",
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#214F5D",
  },
  dangerButton: {
    minHeight: 54,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#B9484E",
  },
  dangerButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFDFB",
    textAlign: "center",
  },
  studentCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#FFF7EF",
    borderWidth: 1,
    borderColor: "#EAD7C8",
    gap: 12,
  },
  studentHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  studentIdentityRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  studentOrderBadge: {
    minWidth: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0E1D1",
  },
  studentOrderText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#7A543C",
  },
  studentInitialBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#214F5D",
  },
  studentInitialText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFDFC",
  },
  studentTitleBlock: {
    flex: 1,
    gap: 4,
  },
  studentName: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
    color: "#223341",
  },
  studentMeta: {
    fontSize: 14,
    lineHeight: 20,
    color: "#5F6972",
  },
  studentPill: {
    minWidth: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#214F5D",
  },
  studentPillText: {
    fontSize: 17,
    fontWeight: "900",
    color: "#FFFDFC",
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  badgeGreen: {
    backgroundColor: "#DFF4E7",
  },
  badgeOrange: {
    backgroundColor: "#FFEAD6",
  },
  badgeTeal: {
    backgroundColor: "#DDF0EF",
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#32414B",
  },
  studentObservation: {
    fontSize: 14,
    lineHeight: 21,
    color: "#5A6670",
  },
  dateNote: {
    fontSize: 13,
    lineHeight: 18,
    color: "#6D655E",
  },
  smallActionButton: {
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  smallActionButtonGreen: {
    backgroundColor: "#DFF4E7",
  },
  smallActionButtonOrange: {
    backgroundColor: "#FFEAD6",
  },
  smallActionButtonTeal: {
    backgroundColor: "#DDF0EF",
  },
  smallActionButtonDanger: {
    backgroundColor: "#F8D6D8",
  },
  smallActionButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#33414B",
  },
  emptyState: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E6D7C9",
    backgroundColor: "#FFF8F3",
    gap: 6,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#2B3D48",
  },
  emptyStateText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#62707A",
  },
  reportCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E4D4C7",
    backgroundColor: "#FFF8F1",
    gap: 8,
  },
  reportHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  reportStudentName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#223341",
  },
  reportLine: {
    fontSize: 14,
    lineHeight: 21,
    color: "#44535E",
  },
  reportObservation: {
    fontSize: 14,
    lineHeight: 21,
    color: "#4E5B65",
  },
  reportStatusText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#5E6B74",
  },
});
