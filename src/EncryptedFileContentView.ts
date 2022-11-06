import { Notice, Setting, TextFileView } from 'obsidian';
import { WorkspaceLeaf } from "obsidian";
import { CryptoHelperV2 } from './CryptoHelper';

export enum EncryptedFileContentViewStateEnum{
	init,
	decryptNote,
	editNote,
	changePassword,
	newNote
}

export const VIEW_TYPE_ENCRYPTED_FILE_CONTENT = "meld-encrypted-file-content-view";
export class EncryptedFileContentView extends TextFileView {
	
	// State
	currentView : EncryptedFileContentViewStateEnum = EncryptedFileContentViewStateEnum.init;
	encryptionPassword:string = '';
	hint:string = '';
	currentEditorText:string = '';
	// end state
	
	actionIconLockNote : HTMLElement;
	actionChangePassword : HTMLElement;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		console.debug('EncryptedFileContentView.constructor', {leaf});
		this.actionIconLockNote = this.addAction( 'lock', 'Lock', (ev) =>{
			//this.currentView = EncryptedFileContentViewStateEnum.decryptNote;
			this.refreshView(EncryptedFileContentViewStateEnum.decryptNote);
		});

		this.actionChangePassword = this.addAction( 'key', 'Change Password', (ev) =>{
			//this.currentView = EncryptedFileContentViewStateEnum.changePassword;
			this.refreshView(EncryptedFileContentViewStateEnum.changePassword);
		});
		
		this.contentEl.style.display = 'flex';
		this.contentEl.style.flexDirection = 'column';
		this.contentEl.style.alignItems = 'center';

	}

	private createTitle( title:string ) : HTMLElement{
		return this.contentEl.createDiv({
			text : `🔐 ${title} 🔐`,
			attr : {
			 	style: 'margin-bottom:2em;'
			}
		});
	}

	private validatePassword ( pw: string ) : string {
		if (pw.length == 0){
			return 'Password is too short';
		}
		return '';
	}

	private validateConfirm ( pw: string, cpw: string ) : string {
		const passwordMatch = pw === cpw;
		return passwordMatch ? '' :'Password doesn\'t match';
	}

	private createNewNoteView() : HTMLElement {
		//console.debug('createDecryptNoteView', { "hint": this.hint} );
		const container = this.createInputContainer();

		new Setting(container)
			.setDesc('Please provide a password and password hint to start editing this note.')
		;

		const submit = async (password: string, confirm: string, hint:string) => {
			var validPw = this.validatePassword(password);
			var validCpw = this.validateConfirm(password, confirm);
			sPassword.setDesc( validPw );
			sConfirm.setDesc( validCpw );

			if ( validPw.length === 0 && validCpw.length === 0 ){
				//set password and hint and open note
				this.encryptionPassword = password;
				this.hint = hint;
				this.currentEditorText = this.file.basename;
				//this.currentView = EncryptedFileContentViewStateEnum.editNote;

				await this.encodeAndSave()
					
				this.refreshView(EncryptedFileContentViewStateEnum.editNote);

			}
		}

		let password = '';
		let confirm = '';
		let hint = '';

		const sPassword = new Setting(container)
			.setName("Password:")
			.setDesc('')
			.addText( tc => {
				tc.inputEl.type = 'password';
				tc.onChange( v => {
					password = v;
					sPassword.setDesc( this.validatePassword(password) );
					sConfirm.setDesc( this.validateConfirm(password, confirm) );
				} );
			} )
		;
		sPassword.controlEl.on('keydown', '*', (ev) =>{
			if ( ev.key === 'Enter' ) {
				ev.preventDefault();
				// validate password
				if (password.length > 0){
					sConfirm.controlEl.querySelector('input').focus();
				}
			}
		});

		const sConfirm = new Setting(container)
			.setName("Confirm:")
			.setDesc('')
			.addText( tc => {
				tc.inputEl.type = 'password';
				tc.onChange( v => {
					confirm = v;
					sPassword.setDesc( this.validatePassword(password) );
					sConfirm.setDesc( this.validateConfirm(password, confirm) );
				});
			} )
		;
		sConfirm.controlEl.on('keydown', '*', (ev) =>{
			if ( ev.key === 'Enter' ) {
				ev.preventDefault();
				// validate confirm
				const passwordMatch = password === confirm;
				if (passwordMatch){
					sHint.controlEl.querySelector('input').focus();
				}
			}
		});


		const sHint = new Setting(container)
			.setName("Hint:")
			.addText((tc) =>{
				tc.onChange( v => {
					hint = v;
				});
			})
		;
		sHint.controlEl.on('keydown', '*', (ev) =>{
			if ( ev.key === 'Enter' ) {
				ev.preventDefault();
				submit(password, confirm, hint);
			}
		});

		new Setting(container)
			.addButton( bc => {
				bc
					.setCta()
					.setIcon('go-to-file')
					.setTooltip('Edit')
					.onClick( (ev) => submit(password, confirm, hint) )
				;
			})
		;

		return container;
	}


	private createDecryptNoteView() : HTMLElement {
		//console.debug('createDecryptNoteView', { "hint": this.hint} );
		const container = this.createInputContainer();

		new Setting(container)
			.setDesc('Please provide a password to unlock this note.')
		;

		new Setting(container)
			.setName("Password:")
			.addText((tc) =>{
				tc.inputEl.type = 'password';
				tc.setValue(this.encryptionPassword)
				tc.setPlaceholder(this.formatHint(this.hint));
				tc.onChange((value) => {
					this.encryptionPassword = value;
				});
				tc.inputEl.onkeydown = async (ev) =>{
					if ( ev.key === 'Enter' ) {
						ev.preventDefault();
						await this.handleDecryptButtonClick();
					}
				}
				setImmediate(() => tc.inputEl.focus())
			})
		;

		new Setting(container)
			.addButton( bc => {
				bc
					.setCta()
					.setIcon('go-to-file')
					.setTooltip('Unlock')
					.onClick( (evt) => this.handleDecryptButtonClick() )
				;
			})
		;

		return container;
	}

	private async encodeAndSave( ){
		console.debug('encodeAndSave');
			
		var fileData = await FileDataHelper.encode(
			this.encryptionPassword,
			this.hint,
			this.currentEditorText
		);
		
		this.data = JsonFileEncoding.encode(fileData);

		this.requestSave();
	}

	private createEditorView() : HTMLElement {
		const container = this.contentEl.createEl('textarea');
		//const container = this.contentEl.createDiv();
		//container.contentEditable = 'true';
		container.style.flexGrow = '1';
		container.style.alignSelf = 'stretch';

		container.value = this.currentEditorText

		container.on('input', '*', async (ev, target) =>{
			console.debug('editor input',{ev, target});
			this.currentEditorText = container.value;
			await this.encodeAndSave();
		});
		return container;
	}

	private createInputContainer() : HTMLElement{
		return this.contentEl.createDiv( {
			'attr': {
				'style': 'width:100%; max-width:400px;'
			}
		} );
	}

	private createChangePasswordView() : HTMLElement {
		const container = this.createInputContainer();

		let newPassword = '';
		let confirm = '';
		let newHint = '';

		const submit = async (newPassword: string, confirm: string, newHint:string) => {
			var validPw = this.validatePassword(newPassword);
			var validCpw = this.validateConfirm(newPassword, confirm);
			sNewPassword.setDesc( validPw );
			sConfirm.setDesc( validCpw );

			if ( validPw.length === 0 && validCpw.length === 0 ){
				//set password and hint and open note
				// var fileData = JsonFileEncoding.decode(this.data);

				// const decryptedText = await FileDataHelper.decrypt(
				// 	fileData,
				// 	this.encryptionPassword
				// );
	
				// if (decryptedText === null){
				// 	new Notice('Decryption failed');
				// }else{
				console.debug('createChangePasswordView submit');
				this.encryptionPassword = newPassword;
				this.hint = newHint;
				//this.currentView = EncryptedFileContentViewStateEnum.editNote;
				//}
				this.encodeAndSave();
				this.refreshView( EncryptedFileContentViewStateEnum.editNote );
			}
		}


		const sNewPassword = new Setting(container)
			.setName("New Password:")
			.setDesc('')
			.addText( tc => {
				tc.inputEl.type = 'password';
				tc.onChange( v => {
					newPassword = v;
					sNewPassword.setDesc( this.validatePassword(newPassword) );
					sConfirm.setDesc( this.validateConfirm(newPassword, confirm) );
				} );
			} )
		;
		sNewPassword.controlEl.on('keydown', '*', (ev) =>{
			if ( ev.key === 'Enter' ) {
				ev.preventDefault();
				// validate password
				if (newPassword.length > 0){
					sConfirm.controlEl.querySelector('input').focus();
				}
			}
		});

		const sConfirm = new Setting(container)
			.setName("Confirm:")
			.setDesc('')
			.addText( tc => {
				tc.inputEl.type = 'password';
				tc.onChange( v => {
					confirm = v;
					sNewPassword.setDesc( this.validatePassword(newPassword) );
					sConfirm.setDesc( this.validateConfirm(newPassword, confirm) );
				});
			} )
		;
		sConfirm.controlEl.on('keydown', '*', (ev) =>{
			if ( ev.key === 'Enter' ) {
				ev.preventDefault();
				// validate confirm
				const passwordMatch = newPassword === confirm;
				if (passwordMatch){
					sHint.controlEl.querySelector('input').focus();
				}
			}
		});


		const sHint = new Setting(container)
			.setName("New Hint:")
			.addText((tc) =>{
				tc.onChange( v => {
					newHint = v;
				});
			})
		;
		sHint.controlEl.on('keydown', '*', (ev) =>{
			if ( ev.key === 'Enter' ) {
				ev.preventDefault();
				submit(newPassword, confirm, newHint);
			}
		});

		new Setting(container)
			.addExtraButton( bc => {
				bc
					.setIcon('undo')
					.setTooltip('Cancel')
					.onClick( () => {
						//this.currentView = cancelState;
						this.refreshView(
							EncryptedFileContentViewStateEnum.editNote
						);
					} )
				;
			})
			.addButton( bc => {
				bc
					.setCta()
					//.setIcon('lock')
					//.setTooltip('Change Password')
					.setButtonText('Change Password')
					.setWarning()
					.onClick( (ev) => {
						submit(newPassword, confirm, newHint);
					} )
				;
			})
		;

		return container;
	}

	private formatHint( hint:string ): string{
		if (hint.length > 0){
			return `Hint: ${hint}`;
		}else{
			return '';
		}
	}

	private refreshView(
		newView: EncryptedFileContentViewStateEnum
	){
		console.debug('refreshView',{'currentView':this.currentView, newView});

		// if (newView == this.currentView ){
		// 	return;
		// }

		this.actionIconLockNote.hide();
		this.actionChangePassword.hide();

		// clear view
		this.contentEl.replaceChildren();

		//const prevView = this.currentView;
		this.currentView = newView;

		switch (this.currentView) {
			case EncryptedFileContentViewStateEnum.newNote:
				this.createTitle('This note will be encrypted');
				this.createNewNoteView();
				this.contentEl.querySelector('input')?.focus();
			break;

			case EncryptedFileContentViewStateEnum.decryptNote:
				this.createTitle('This note is encrypted');
				this.createDecryptNoteView();
				this.contentEl.querySelector('input')?.focus();
			break;
			
			case EncryptedFileContentViewStateEnum.editNote:
				this.actionIconLockNote.show();
				this.actionChangePassword.show();
				this.createTitle('This note is encrypted');
				this.createEditorView();
				this.contentEl.querySelector('textarea')?.focus();
			break;

			case EncryptedFileContentViewStateEnum.changePassword:
				this.createTitle('Change encrypted note password');
				this.createChangePasswordView();
				this.contentEl.querySelector('input')?.focus();
			break;
		}

	}

	async handleDecryptButtonClick() {
		var fileData = JsonFileEncoding.decode(this.data)
						
		console.debug('Decrypt button', fileData);

		const decryptedText = await FileDataHelper.decrypt(
			fileData,
			this.encryptionPassword
		);

		if (decryptedText === null){
			new Notice('Decryption failed');
		}else{
			//this.currentView = EncryptedFileContentViewStateEnum.editNote;
			this.currentEditorText = decryptedText;
			this.refreshView( EncryptedFileContentViewStateEnum.editNote);
		}

	}

	// protected override async onOpen(): Promise<void> {
	// 	super.onOpen();
	// 	console.debug('onOpen',{ 'state': this.getState(), 'estate': this.getEphemeralState()});
	// }

	// override async setState(state: any, result: ViewStateResult): Promise<void> {
	// 	console.debug('setState',{ state, result});
	// 	super.setState(state, result);
	// 	if ( state['viewState'] === EncryptedFileContentViewStateEnum.newNote ){
	// 		console.debug('setState - new note');
	// 		this.currentView = EncryptedFileContentViewStateEnum.newNote;
	// 	}
	// }

	// override async onLoadFile(file: TFile): Promise<void> {
	// 	console.debug('onLoadFile',{file});
	// 	super.onLoadFile(file);
	// }

	

	// override async onUnloadFile(file: TFile): Promise<void> {
	// 	console.debug('onUnloadFile',{file});
	// 	super.onUnloadFile(file);
	// }

	// important
	canAcceptExtension(extension: string): boolean {
		console.debug('EncryptedFileContentView.canAcceptExtension', {extension});
		return extension == 'encrypted';
	}

	// important
	getViewType() {
		return VIEW_TYPE_ENCRYPTED_FILE_CONTENT;
	}

	override setViewData(data: string, clear: boolean): void {
		console.debug('EncryptedFileContentView.setViewData', {
			data,
			clear,
			'pass':this.encryptionPassword,
			//'mode':this.getMode(),
			//'mode-data':this.currentMode.get(),
			//'preview-mode-data':this.previewMode.get()
		});

		var newView = this.currentView;
		if (clear){
			this.encryptionPassword = '';
			if (data == ''){
				newView = EncryptedFileContentViewStateEnum.newNote;
			}else{
				newView = EncryptedFileContentViewStateEnum.decryptNote;
			}
		}

		// decode file data
		var fileData = JsonFileEncoding.decode(this.data);
		
		this.hint = fileData.hint;
		this.refreshView( newView );
	}

	// the data to save to disk
	override getViewData(): string {
		console.debug('EncryptedFileContentView.getViewData', {
			'this':this,
			'data':this.data,
		});
		
		return this.data;
	}

	override clear(): void {
		console.debug('EncryptedFileContentView.clear');
	}


}

class FileData{
	
	public version : string = "1.0";
	public hint: string;
	public encodedData:string;

	constructor( hint:string, encodedData:string ){
		this.hint = hint;
		this.encodedData = encodedData;
	}
}

class FileDataHelper{

	public static async encode( pass: string, hint:string, text:string ) : Promise<FileData>{
		const crypto = new CryptoHelperV2();
		const encryptedBytes = await crypto.encryptToBytes(text, pass);
		var encryptedData = Buffer.from(encryptedBytes).toString('base64');
		return new FileData(hint, encryptedData);
	}

	public static async decrypt( data: FileData, pass:string ) : Promise<string>{
		if (data.encodedData == "" ){
			return "";
		}
		const encryptedBytes = Buffer.from(data.encodedData, 'base64');
		const crypto = new CryptoHelperV2();
		return await crypto.decryptFromBytes(encryptedBytes, pass);
	}
}

class JsonFileEncoding {

	public static encode( data: FileData ) : string{
		return JSON.stringify(data, null, 2);
	}

	public static decode( encodedText:string ) : FileData{
		console.debug('JsonFileEncoding.decode',{encodedText});
		if (encodedText === ''){
			return new FileData( "", "" );
		}
		return JSON.parse(encodedText) as FileData;
	}
}